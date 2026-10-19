(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const DAY = 86400000;
  const STORE_KEY = 'shici.state.v1';
  const SHARE_TOKEN = 'shici-9f4c2a7e6b1d8c3a';
  const STOPWORDS = new Set(('a about above after again against all am an and any are aren as at be because been before being below between both but by can cannot could couldn did didn do does doesn doing don down during each few for from further had hadn has hasn have haven having he her here hers herself him himself his how i if in into is isn it its itself just ll me more most my myself no nor not now of off on once only or other ought our ours ourselves out over own re same shan she should shouldn so some such than that the their theirs them themselves then there these they this those through to too under until up ve very was wasn we were weren what when where which while who whom why will with won would wouldn you your yours yourself yourselves also may might must shall upon within without across around toward towards however therefore thus yet still even ever every much many one two three').split(/\s+/));

  const currentDate = () => {
    const d = new Date();
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · ${'日一二三四五六'[d.getDay()] === '日' ? '星期日' : '星期' + '日一二三四五六'[d.getDay()]}`;
  };

  const dateKey = (d = new Date()) => {
    const x = new Date(d);
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  };
  const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

  function cleanTrans(text) {
    let t = String(text || '')
      .replace(/\s*(副\s*词|名\s*词|时态|过去式|过去分词|现在分词|第三人称单数|比较级|最高级|反义词|派生词|词源)\s*[:：].*$/u, '')
      .replace(/\s*\((?:adj|adv|n|v|vt|vi)\.\)\s*$/i, '')
      .replace(/\s+/g, ' ')
      .trim();
    t = t.replace(/\s+[A-Z][A-Za-z]{2,}\s*[;；].*$/, '');
    t = t.replace(/([\u4e00-\u9fa5）)])\s*[A-Za-z]{3,}.*$/, '$1');
    if (t.length > 88) {
      const cut = Math.max(t.lastIndexOf('；', 88), t.lastIndexOf('，', 88), t.lastIndexOf('、', 88), t.lastIndexOf(';', 88));
      t = t.slice(0, cut > 26 ? cut : 88).replace(/[，、；;:：\s]+$/, '') + '…';
    }
    return t;
  }

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  const seedSource = [
    ['resilient', 'rɪˈzɪljənt', 'adj. 有弹性的；能迅速恢复的', 'learning', 3, 3, 4],
    ['ephemeral', 'ɪˈfɛmərəl', 'adj. 短暂的；转瞬即逝的', 'new', 1, 0, 0],
    ['luminous', 'ˈlʊmənəs', 'adj. 发光的；明亮的', 'learning', 2, 2, 2],
    ['cherish', 'ˈtʃɛrɪʃ', 'v. 珍爱；珍视', 'mastered', 8, 21, 9],
    ['meticulous', 'məˈtɪkjələs', 'adj. 一丝不苟的；小心翼翼的', 'new', 1, 0, 0],
    ['tranquil', 'ˈtræŋkwəl', 'adj. 平静的；安宁的', 'learning', 1, 1, 1],
    ['vivid', 'ˈvɪvɪd', 'adj. 生动的；鲜艳的', 'learning', 4, 4, 3],
    ['endeavor', 'ɪnˈdɛvər', 'n. / v. 努力；尽力', 'new', 2, 0, 0],
  ];
  const seedWords = seedSource.map(([word, phone, trans, status, interval, dueInDays, reviews], i) => ({
    id: uid(),
    word,
    phone,
    trans,
    status,
    interval,
    due: status === 'mastered' ? Date.now() + 8 * DAY : (status === 'new' ? Date.now() - 1000 : Date.now() - dueInDays * 3600000),
    ease: 2.5,
    reviews,
    correct: Math.max(0, reviews - 1),
    addedAt: Date.now() - (seedSource.length - i) * 6 * 3600000,
    source: 'seed',
  }));

  function makeInitialState() {
    return {
      version: 1,
      words: seedWords,
      notes: [],
      settings: { dailyGoal: 10 },
      stats: {
        studyDates: [],
        reviewedToday: { date: dateKey(), count: 0 },
        totalReviews: 0,
        correct: 0,
      },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return makeInitialState();
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.words)) return makeInitialState();
      parsed.settings = Object.assign({ dailyGoal: 10 }, parsed.settings || {});
      parsed.notes = Array.isArray(parsed.notes) ? parsed.notes : [];
      parsed.stats = Object.assign({ studyDates: [], reviewedToday: { date: dateKey(), count: 0 }, totalReviews: 0, correct: 0 }, parsed.stats || {});
      if (parsed.stats.reviewedToday.date !== dateKey()) parsed.stats.reviewedToday = { date: dateKey(), count: 0 };
      return parsed;
    } catch {
      return makeInitialState();
    }
  }

  const state = loadState();
  const dict = new Map();
  let dictReady = false;
  let activeScreen = 'today';
  let libraryFilter = 'all';
  let searchQuery = '';
  let reviewLayout = 'random';
  let batchMode = false;
  const batchSelected = new Set();
  let reviewSession = null;
  let deferredInstall = null;
  let toastTimer = null;
  let inboxBusy = false;
  let shareApiAvailable = null;
  let currentNoteId = null;
  let noteSaveTimer = null;
  let noteDetectTimer = null;
  const extras = { sentences: {}, forms: {} };
  let extrasReady = false;
  let extrasPromise = null;
  let detailExtraToken = 0;

  const live = { ocrResults: [], selected: new Set(), imageUrl: null, worker: null, workerReady: false, rareOnly: true, source: 'photo' };
  const RARE_RANK = 2500;
  const spellState = { target: '', checked: false, hadError: false, hintUsed: false, rating: 'good' };
  const writing = { strokes: [], current: null, activeId: null, tool: 'pen', penUsed: false, revealed: false };

  if (window.pdfjsLib) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf/pdf.worker.min.js';
  }

  function save() {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }

  const byWord = (word) => state.words.find(w => w.word.toLowerCase() === String(word).toLowerCase());
  const lookup = (word) => dict.get(String(word || '').toLowerCase());

  function streak() {
    const days = new Set(state.stats.studyDates || []);
    const cursor = new Date();
    if (!days.has(dateKey(cursor))) cursor.setDate(cursor.getDate() - 1);
    let n = 0;
    while (days.has(dateKey(cursor))) {
      n += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return n;
  }

  function markStudied() {
    const k = dateKey();
    if (!state.stats.studyDates.includes(k)) state.stats.studyDates.push(k);
    save();
  }

  function dueList() {
    const now = Date.now();
    return state.words
      .filter(w => w.status === 'new' || (w.status !== 'mastered' && w.due <= now))
      .sort((a, b) => (a.due || 0) - (b.due || 0) || a.addedAt - b.addedAt);
  }

  function renderToday() {
    const due = dueList();
    const goal = state.settings.dailyGoal;
    const done = state.stats.reviewedToday?.count || 0;
    const pct = Math.min(100, Math.round((done / goal) * 100));
    $('#today-date').textContent = currentDate();
    $('#streak-days').textContent = streak();
    $('#today-remain').textContent = Math.max(0, goal - done);
    $('#today-done').textContent = done;
    $('#today-goal').textContent = goal;
    $('#ring-pct').textContent = pct;
    $('#today-ring').style.setProperty('--p', pct);
    $('#due-count').textContent = due.filter(w => w.status !== 'new').length;
    $('#new-count').textContent = state.words.filter(w => w.status === 'new').length;
    $$('.layout-chip').forEach(c => c.classList.toggle('is-active', c.dataset.layout === reviewLayout));
    if (reviewLayout === 'meaning') $('#review-label').textContent = '近义串记';
    else if (reviewLayout === 'spelling') $('#review-label').textContent = '形近串记';
    else $('#review-label').textContent = due.length ? `开始复习 · ${Math.min(due.length, 20)} 个` : '自由复习';
    $('#stat-total').textContent = state.words.length;
    $('#stat-mastered').textContent = state.words.filter(w => w.status === 'mastered').length;
    $('#stat-days').textContent = new Set(state.stats.studyDates).size;
    if (due.length === 0) $('#hero-note').textContent = '今天的复习清空了，去认识一个新词吧。';
    else if (due.length <= 5) $('#hero-note').textContent = '只差一点点，今天就能收工。';
    else $('#hero-note').textContent = '把零碎时间，变成你的词汇量。';

    const recent = [...state.words].sort((a, b) => b.addedAt - a.addedAt).slice(0, 3);
    const recentBox = $('#recent-list');
    recentBox.innerHTML = '';
    recent.forEach((w, i) => {
      const btn = document.createElement('button');
      btn.className = 'recent-word';
      const stateLabel = w.status === 'mastered' ? '已掌握' : (w.status === 'new' ? '新词' : (w.due <= Date.now() ? '待复习' : '学习中'));
      const stateClass = w.status === 'mastered' ? 'mastered' : (w.due <= Date.now() && w.status !== 'new' ? 'due' : '');
      btn.innerHTML = `<span class="recent-index">0${i + 1}</span><span class="recent-main"><b></b><small></small></span><span class="recent-state ${stateClass}"></span>`;
      $('.recent-main b', btn).textContent = w.word;
      $('.recent-main small', btn).textContent = w.trans || '待补充释义';
      $('.recent-state', btn).textContent = stateLabel;
      btn.addEventListener('click', () => openDetail(w.id));
      recentBox.appendChild(btn);
    });
    if (!recent.length) {
      recentBox.innerHTML = '<p style="font-size:12px;color:var(--ink-soft);margin:0;padding:8px 0">还没有单词，先拍一张试试。</p>';
    }
  }

  function filteredWords() {
    const now = Date.now();
    let list = [...state.words];
    if (libraryFilter === 'due') list = list.filter(w => w.status === 'new' || (w.status !== 'mastered' && w.due <= now));
    if (libraryFilter === 'new') list = list.filter(w => w.status === 'new');
    if (libraryFilter === 'mastered') list = list.filter(w => w.status === 'mastered');
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(w => w.word.toLowerCase().includes(q) || (w.trans || '').toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
      const ad = a.status === 'new' || (a.status !== 'mastered' && a.due <= now);
      const bd = b.status === 'new' || (b.status !== 'mastered' && b.due <= now);
      return (bd - ad) || (b.addedAt - a.addedAt);
    });
  }

  function renderLibrary() {
    $('#library-total').textContent = state.words.length;
    $('#screen-library').classList.toggle('batch-mode', batchMode);
    const list = filteredWords();
    const box = $('#word-list');
    box.innerHTML = '';
    const empty = $('#library-empty');
    empty.hidden = list.length > 0 || state.words.length > 0;
    if (list.length && state.words.length) {
      for (const w of list) {
        const card = document.createElement('button');
        card.className = 'word-card' + (batchMode ? ' batch-card' : '');
        card.type = 'button';
        const isDue = w.status !== 'mastered' && w.due <= Date.now();
        const pillClass = w.status === 'mastered' ? 'mastered' : (w.status === 'new' ? 'due' : (isDue ? 'learning' : ''));
        const pillText = w.status === 'mastered' ? '已掌握' : (w.status === 'new' ? '新词' : (isDue ? '该复习了' : '学习中'));
        const pct = Math.min(100, Math.max(4, Math.round(((w.interval || 0) / 21) * 100)));
        card.innerHTML = `<span class="word-main"><span class="word-top"><b></b><span class="phone"></span></span><span class="word-trans"></span><span class="word-bottom"><span class="mini-pill ${pillClass}">${pillText}</span></span></span><span class="word-side"><span class="sound-mini" data-sound><svg><use href="#i-sound"/></svg></span><span class="mastery-bar"><i style="width:${pct}%"></i></span></span>`;
        $('.word-top b', card).textContent = w.word;
        $('.phone', card).textContent = w.phone ? `/ ${w.phone} /` : '';
        $('.word-trans', card).textContent = w.trans || '待补充释义';
        if (batchMode) {
          const check = document.createElement('span');
          check.className = 'batch-check';
          check.innerHTML = '<svg><use href="#i-check"/></svg>';
          card.insertBefore(check, card.firstChild);
          card.classList.toggle('is-selected', batchSelected.has(w.id));
        }
        card.addEventListener('click', (e) => {
          if (batchMode) {
            if (batchSelected.has(w.id)) batchSelected.delete(w.id);
            else batchSelected.add(w.id);
            card.classList.toggle('is-selected', batchSelected.has(w.id));
            updateBatchBar();
            return;
          }
          if (e.target.closest('[data-sound]')) {
            e.stopPropagation();
            speak(w.word);
            return;
          }
          openDetail(w.id);
        });
        box.appendChild(card);
      }
    }
    if (batchMode) updateBatchBar();
    else removeBatchBar();
  }

  function removeBatchBar() {
    $('.batch-bar')?.remove();
    document.body.classList.remove('batch-active');
  }

  function ensureBatchBar() {
    let bar = $('.batch-bar');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.className = 'batch-bar';
    bar.innerHTML = '<span>已选 <b class="batch-num">0</b> 个</span><button class="batch-select">全选</button><button class="batch-delete" disabled>删除</button>';
    $('.batch-select', bar).addEventListener('click', toggleAllVisible);
    $('.batch-delete', bar).addEventListener('click', deleteSelected);
    document.body.appendChild(bar);
    document.body.classList.add('batch-active');
    return bar;
  }

  function updateBatchBar() {
    if (!batchMode) {
      removeBatchBar();
      return;
    }
    const visible = filteredWords();
    const all = visible.length > 0 && visible.every(w => batchSelected.has(w.id));
    const bar = ensureBatchBar();
    $('.batch-num', bar).textContent = batchSelected.size;
    const select = $('.batch-select', bar);
    select.textContent = all ? '取消全选' : '全选';
    select.disabled = visible.length === 0;
    $('.batch-delete', bar).disabled = batchSelected.size === 0;
  }

  function setBatchMode(on) {
    batchMode = !!on;
    batchSelected.clear();
    $('#btn-batch-mode').classList.toggle('is-active', batchMode);
    $('#btn-batch-mode').textContent = batchMode ? '取消' : '选择';
    $('#screen-library').classList.toggle('batch-mode', batchMode);
    if (!batchMode) removeBatchBar();
    renderLibrary();
  }

  function toggleAllVisible() {
    const visible = filteredWords();
    const all = visible.length > 0 && visible.every(w => batchSelected.has(w.id));
    if (all) visible.forEach(w => batchSelected.delete(w.id));
    else visible.forEach(w => batchSelected.add(w.id));
    renderLibrary();
  }

  function deleteSelected() {
    const count = batchSelected.size;
    if (!count) return;
    if (!confirm(`确定删除选中的 ${count} 个单词吗？删除后无法恢复。`)) return;
    const ids = new Set(batchSelected);
    state.words = state.words.filter(w => !ids.has(w.id));
    save();
    batchSelected.clear();
    renderAll();
    toast(`已删除 ${count} 个单词`);
    if (!state.words.length) setBatchMode(false);
  }

  function formatNoteDate(ts) {
    const d = new Date(ts || Date.now());
    return `${d.getMonth() + 1}月${d.getDate()}日 · 星期${'日一二三四五六'[d.getDay()]}`;
  }

  function noteTitle(content) {
    const line = String(content || '').split('\n').map(s => s.trim()).find(Boolean) || '课堂笔记';
    return line.replace(/^#+\s*/, '').slice(0, 26) || '课堂笔记';
  }

  function currentNote() {
    return state.notes.find(n => n.id === currentNoteId) || null;
  }

  function ensureCurrentNote() {
    if (!state.notes.length) {
      const note = { id: uid(), title: '课堂笔记', content: '', createdAt: Date.now(), updatedAt: Date.now() };
      state.notes.unshift(note);
      currentNoteId = note.id;
      save();
    }
    if (!currentNoteId || !state.notes.some(n => n.id === currentNoteId)) {
      currentNoteId = [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt)[0].id;
    }
    return currentNote();
  }

  function flushNoteSave() {
    clearTimeout(noteSaveTimer);
    clearTimeout(noteDetectTimer);
    noteSaveTimer = null;
    noteDetectTimer = null;
    const note = currentNote();
    if (!note) return;
    const value = $('#note-input').value;
    if (value !== note.content) {
      note.content = value;
      note.title = noteTitle(value);
      note.updatedAt = Date.now();
      save();
    }
  }

  function renderNoteTabs() {
    const box = $('#note-tabs');
    box.innerHTML = '';
    const notes = [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 6);
    notes.forEach(note => {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'note-tab' + (note.id === currentNoteId ? ' is-active' : '');
      tab.innerHTML = '<b></b><small></small>';
      $('b', tab).textContent = note.title || '课堂笔记';
      const d = new Date(note.updatedAt || note.createdAt);
      $('small', tab).textContent = `${d.getMonth() + 1}/${d.getDate()}`;
      tab.addEventListener('click', () => selectNote(note.id));
      box.appendChild(tab);
    });
  }

  function renderNoteWords() {
    const note = currentNote();
    const items = extractWords(note?.content || '').slice(0, 30);
    const list = $('#note-word-list');
    list.innerHTML = '';
    let pending = 0;
    for (const item of items) {
      const word = item.entry?.word || item.word;
      const existing = byWord(word);
      if (!existing) pending += 1;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'note-word' + (existing ? ' is-added' : '');
      row.innerHTML = '<span class="note-word-main"><b></b><small></small></span><span class="note-word-state"></span>';
      $('.note-word-main b', row).textContent = word;
      $('.note-word-main small', row).textContent = item.entry?.trans || '词典里还没有这个词，可以手动补充释义';
      $('.note-word-state', row).textContent = existing ? '已在词库' : (item.entry ? '点击收录' : '未收录');
      row.addEventListener('click', () => {
        const saved = byWord(word);
        if (saved) return openDetail(saved.id);
        const added = addWord(word, item.entry?.trans || '', item.entry?.phone || '', 'note');
        if (!added) return;
        save();
        renderNoteWords();
        renderToday();
        renderLibrary();
        toast(`收进词库：${added.word}`);
      });
      list.appendChild(row);
    }
    $('#note-count').textContent = items.length;
    $('#note-word-empty').hidden = items.length > 0;
    const collect = $('#btn-note-collect');
    collect.disabled = pending === 0;
    collect.textContent = pending ? `把待收的 ${pending} 个词加入词库` : '把待收词加入词库';
  }

  function detectNoteWords(auto = true) {
    const note = currentNote();
    if (!note) return;
    const items = extractWords(note.content || '').slice(0, 30);
    let added = 0;
    if (auto) {
      for (const item of items) {
        if (added >= 8) break;
        if (!item.entry) continue;
        const rare = !item.entry.rank || item.entry.rank > RARE_RANK;
        if (!rare || byWord(item.word)) continue;
        const saved = addWord(item.entry.word, item.entry.trans, item.entry.phone, 'note');
        if (saved) added += 1;
      }
    }
    if (added) {
      save();
      renderToday();
      renderLibrary();
      $('#note-auto').textContent = `已自动收进 ${added} 个词 · 点击单词查看拓展`;
    }
    renderNoteWords();
  }

  function handleNoteInput(event) {
    const note = currentNote();
    if (!note) return;
    note.content = event.target.value;
    note.title = noteTitle(note.content);
    note.updatedAt = Date.now();
    $('#note-save').textContent = '正在保存…';
    clearTimeout(noteSaveTimer);
    noteSaveTimer = setTimeout(() => {
      save();
      $('#note-save').textContent = '已保存';
      renderNoteTabs();
    }, 500);
    clearTimeout(noteDetectTimer);
    noteDetectTimer = setTimeout(() => detectNoteWords(true), 1100);
  }

  function renderNotes() {
    const note = ensureCurrentNote();
    $('#note-input').value = note.content || '';
    $('#note-date').textContent = formatNoteDate(note.updatedAt || note.createdAt);
    $('#note-save').textContent = '已保存';
    $('#note-auto').textContent = '写下的生词会自动收进词库 · 点击单词查看拓展';
    renderNoteTabs();
    renderNoteWords();
    setTimeout(() => detectNoteWords(true), 160);
  }

  function selectNote(id, focus = false) {
    flushNoteSave();
    if (!state.notes.some(n => n.id === id)) return;
    currentNoteId = id;
    renderNotes();
    if (focus) setTimeout(() => $('#note-input').focus(), 120);
  }

  function createNote() {
    flushNoteSave();
    const note = { id: uid(), title: '课堂笔记', content: '', createdAt: Date.now(), updatedAt: Date.now() };
    state.notes.unshift(note);
    currentNoteId = note.id;
    save();
    renderNotes();
    setTimeout(() => $('#note-input').focus(), 120);
  }

  function collectPendingNoteWords() {
    const note = currentNote();
    if (!note) return;
    const items = extractWords(note.content || '').slice(0, 30);
    let added = 0;
    for (const item of items) {
      if (byWord(item.word)) continue;
      const saved = addWord(item.entry?.word || item.word, item.entry?.trans || '', item.entry?.phone || '', 'note');
      if (saved) added += 1;
    }
    if (!added) return toast('没有待收的单词');
    save();
    renderNoteWords();
    renderToday();
    renderLibrary();
    toast(`收进词库 +${added}`);
  }

  function openNoteHistory() {
    flushNoteSave();
    const notes = [...state.notes].sort((a, b) => b.updatedAt - a.updatedAt);
    openSheet(`
      <h2>历史笔记</h2>
      <p class="sheet-sub">课堂笔记会自动保存在这台 iPad 上。</p>
      <div id="note-history-list"></div>
      <div class="sheet-actions">
        <button class="btn btn-soft" id="note-history-close">关闭</button>
        <button class="btn btn-primary" id="note-history-new">新建笔记</button>
      </div>
    `);
    const list = $('#note-history-list');
    notes.forEach(note => {
      const row = document.createElement('div');
      row.className = 'note-history-item';
      row.innerHTML = '<button class="note-history-open"><b></b><small></small></button><button class="note-history-del">删除</button>';
      $('b', row).textContent = note.title || '课堂笔记';
      $('small', row).textContent = formatNoteDate(note.updatedAt || note.createdAt);
      $('.note-history-open', row).addEventListener('click', () => {
        closeSheet();
        selectNote(note.id);
      });
      $('.note-history-del', row).addEventListener('click', () => {
        if (!confirm(`删除笔记「${note.title || '课堂笔记'}」？`)) return;
        state.notes = state.notes.filter(n => n.id !== note.id);
        if (currentNoteId === note.id) currentNoteId = null;
        save();
        closeSheet();
        ensureCurrentNote();
        renderNotes();
      });
      list.appendChild(row);
    });
    $('#note-history-close').addEventListener('click', closeSheet);
    $('#note-history-new').addEventListener('click', () => {
      closeSheet();
      createNote();
    });
  }

  function renderAll() {
    renderToday();
    renderLibrary();
  }

  function nav(name) {
    if (!['today', 'notes', 'capture', 'library'].includes(name)) return;
    if (activeScreen === 'notes' && name !== 'notes') flushNoteSave();
    if (name !== 'library' && batchMode) setBatchMode(false);
    activeScreen = name;
    $$('.screen').forEach(s => s.classList.toggle('is-active', s.dataset.screen === name));
    $$('.tab').forEach(t => t.classList.toggle('is-active', t.dataset.go === name));
    if (name === 'library') renderLibrary();
    if (name === 'today') renderToday();
    if (name === 'notes') renderNotes();
    window.scrollTo({ top: 0, behavior: 'instant' });
    document.activeElement?.blur?.();
  }

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
  }

  function speak(word) {
    if (!('speechSynthesis' in window)) return toast('这个设备暂不支持朗读');
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(word);
    utter.lang = 'en-US';
    utter.rate = .86;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => /en-US/i.test(v.lang) && /natural|samantha|aria|zira|google/i.test(v.name)) || voices.find(v => /^en[-_]/i.test(v.lang));
    if (voice) utter.voice = voice;
    window.speechSynthesis.speak(utter);
  }

  function addWord(word, trans, phone, source = 'manual') {
    const clean = String(word || '').trim().replace(/^[^A-Za-z]+|[^A-Za-z'-]+$/g, '');
    if (!clean) return null;
    if (byWord(clean)) return null;
    const entry = lookup(clean);
    const w = {
      id: uid(),
      word: clean,
      phone: phone || entry?.phone || '',
      trans: cleanTrans(trans || entry?.trans || '') || '待补充释义',
      status: 'new',
      interval: 0,
      due: Date.now(),
      ease: 2.5,
      reviews: 0,
      correct: 0,
      addedAt: Date.now(),
      source,
    };
    state.words.push(w);
    save();
    return w;
  }

  /* ---------------- dictionary & OCR ---------------- */

  async function loadDictionary() {
    try {
      const res = await fetch('dict.json', { cache: 'force-cache' });
      const rows = await res.json();
      for (const [w, p, t, r] of rows) dict.set(String(w).toLowerCase(), { word: w, phone: p || '', trans: cleanTrans(t), rank: r || 0 });
      dictReady = true;
    } catch (err) {
      console.warn('dictionary failed', err);
      dictReady = false;
    }
  }

  async function loadExtras() {
    if (extrasReady) return;
    if (!extrasPromise) {
      extrasPromise = fetch('extra.json', { cache: 'force-cache' })
        .then(res => res.json())
        .then(data => {
          Object.assign(extras.sentences, data.sentences || {});
          Object.assign(extras.forms, data.forms || {});
          extrasReady = true;
        })
        .catch(err => {
          console.warn('extras failed', err);
          extrasReady = true;
        });
    }
    await extrasPromise;
  }

  async function syncShareInbox() {
    if (inboxBusy || location.protocol === 'file:' || shareApiAvailable === false) return;
    inboxBusy = true;
    try {
      const res = await fetch(`api/inbox?token=${SHARE_TOKEN}`, { cache: 'no-store' });
      if (!res.ok) {
        shareApiAvailable = false;
        return;
      }
      shareApiAvailable = true;
      const data = await res.json();
      const items = Array.isArray(data.items) ? data.items : [];
      if (!items.length) return;
      if (!dictReady) await loadDictionary();
      const text = items.map(item => String(item.text || '')).join('\n');
      const tokenCount = (text.match(/[A-Za-z]+(?:['-][A-Za-z]+)?/g) || []).length;
      const found = extractWords(text);
      let added = 0;
      for (const item of found) {
        if (added >= 20) break;
        const rare = !item.entry || !item.entry.rank || item.entry.rank > RARE_RANK;
        if (!rare && tokenCount > 3) continue;
        if (!item.entry && tokenCount > 3) continue;
        const saved = addWord(item.entry?.word || item.word, item.entry?.trans || '', item.entry?.phone || '', 'share');
        if (saved) added += 1;
      }
      await fetch('api/inbox/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: SHARE_TOKEN, ids: items.map(item => item.id) }),
      }).catch(() => {});
      if (added) {
        save();
        renderAll();
        toast(`从分享收进 ${added} 个词`);
      }
    } catch (err) {
      console.warn('share inbox unavailable', err);
    } finally {
      inboxBusy = false;
    }
  }

  async function checkShareApi() {
    try {
      const res = await fetch('api/ping', { cache: 'no-store' });
      shareApiAvailable = res.ok;
    } catch {
      shareApiAvailable = false;
    }
  }

  function normalizeOcr(text) {
    return text.replace(/[|_[\]{}<>]/g, ' ').replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  }

  function extractWords(text) {
    const tokens = normalizeOcr(text).match(/[A-Za-z]+(?:['-][A-Za-z]+)?/g) || [];
    const found = new Map();
    for (const raw of tokens) {
      const word = raw.toLowerCase().replace(/^[-']+|[-']+$/g, '');
      if (word.length < 3 || word.length > 26) continue;
      if (STOPWORDS.has(word)) continue;
      const entry = dict.get(word) || lemmaEntry(word);
      if (!entry && word.length < 5) continue;
      if (!entry && /^\d/.test(word)) continue;
      const key = entry ? entry.word.toLowerCase() : word;
      const item = found.get(key) || { word, form: entry && entry.word.toLowerCase() !== word ? word : '', entry, count: 0 };
      item.count += 1;
      found.set(key, item);
    }
    return [...found.values()]
      .sort((a, b) => {
        const ar = !a.entry || !a.entry.rank || a.entry.rank > RARE_RANK;
        const br = !b.entry || !b.entry.rank || b.entry.rank > RARE_RANK;
        return (br - ar) || ((a.entry?.rank || 99999) - (b.entry?.rank || 99999)) || a.word.localeCompare(b.word);
      })
      .slice(0, 80);
  }

  function lemmaEntry(word) {
    const forms = new Set();
    if (word.endsWith('ies')) forms.add(word.slice(0, -3) + 'y');
    if (word.endsWith('ied')) forms.add(word.slice(0, -3) + 'y');
    if (word.endsWith('es')) forms.add(word.slice(0, -2));
    if (word.endsWith('s')) forms.add(word.slice(0, -1));
    if (word.endsWith('ing')) {
      const stem = word.slice(0, -3);
      forms.add(stem);
      forms.add(stem + 'e');
      if (stem.length > 3 && stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
    }
    if (word.endsWith('ed')) {
      const stem = word.slice(0, -2);
      forms.add(stem);
      forms.add(word.slice(0, -1));
      if (stem.length > 3 && stem.at(-1) === stem.at(-2)) forms.add(stem.slice(0, -1));
    }
    if (word.endsWith('er')) { forms.add(word.slice(0, -2)); forms.add(word.slice(0, -1)); }
    if (word.endsWith('est')) { forms.add(word.slice(0, -3)); forms.add(word.slice(0, -2)); }
    for (const f of forms) {
      const entry = dict.get(f);
      if (entry) return entry;
    }
    return null;
  }

  async function preprocess(file) {
    let bitmap;
    if ('createImageBitmap' in window) {
      try {
        bitmap = await createImageBitmap(file);
      } catch {
        bitmap = null;
      }
    }
    if (!bitmap) {
      bitmap = await new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
        img.src = url;
      });
    }
    const max = 1900;
    let scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    if (bitmap.width < 900) scale = Math.min(1.8, 1200 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;
    let min = 255, maxV = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
      if (v < min) min = v;
      if (v > maxV) maxV = v;
    }
    const range = Math.max(1, maxV - min);
    for (let i = 0; i < data.length; i += 4) {
      let v = data[i] * .299 + data[i + 1] * .587 + data[i + 2] * .114;
      v = ((v - min) / range) * 255;
      v = Math.max(0, Math.min(255, (v - 128) * 1.2 + 128));
      data[i] = data[i + 1] = data[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
    bitmap.close?.();
    return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92));
  }

  const OCR_LABELS = {
    'loading tesseract core': '载入识别引擎…',
    'initializing tesseract': '初始化识别引擎…',
    'loading language traineddata': '载入英语模型…',
    'initializing api': '准备识别…',
    'recognizing text': '正在逐词识别…',
  };

  async function ensureWorker() {
    if (live.worker) return live.worker;
    if (!window.Tesseract) throw new Error('OCR 引擎未载入');
    const worker = await Tesseract.createWorker('eng', 1, {
      workerPath: 'vendor/worker.min.js',
      corePath: 'vendor/core',
      langPath: 'vendor/lang',
      logger: m => {
        if (m.status === 'recognizing text') {
          $('#scan-label').textContent = `正在识别… ${Math.round((m.progress || 0) * 100)}%`;
        } else if (OCR_LABELS[m.status]) {
          $('#scan-label').textContent = OCR_LABELS[m.status];
        }
      },
    });
    await worker.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' });
    live.worker = worker;
    live.workerReady = true;
    return worker;
  }

  async function handlePhoto(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('请选择一张图片');
    live.source = 'photo';
    $('#file-summary').hidden = true;
    if (live.imageUrl) URL.revokeObjectURL(live.imageUrl);
    live.imageUrl = URL.createObjectURL(file);
    $('#preview-img').src = live.imageUrl;
    $('#viewfinder').hidden = true;
    $('#capture-preview').hidden = false;
    $('#capture-buttons').hidden = true;
    $('#ocr-section').hidden = true;
    $('#scan-overlay').hidden = false;
    $('#scan-label').textContent = dictReady ? '正在读懂画面…' : '正在准备词典…';
    removeAddBar();
    if (!dictReady) await loadDictionary();
    try {
      const blob = await preprocess(file);
      const worker = await ensureWorker();
      $('#scan-label').textContent = '正在逐词识别…';
      const { data } = await worker.recognize(blob);
      showOcrResults(data.text || '');
    } catch (err) {
      console.error(err);
      $('#scan-overlay').hidden = true;
      $('#capture-buttons').hidden = false;
      toast('这次没识别成功，可以换张照片或手动添加');
    }
  }

  function showFileSummary(name, meta, status) {
    $('#file-name').textContent = name;
    $('#file-meta').textContent = meta;
    $('#file-status').textContent = status;
    $('#file-summary').hidden = false;
  }

  function handleFile(file) {
    if (!file) return;
    const name = (file.name || '').toLowerCase();
    if (file.type === 'application/pdf' || name.endsWith('.pdf')) return handlePdfFile(file);
    if (file.type.startsWith('image/')) return handlePhoto(file);
    if (file.type.startsWith('text/') || /\.(txt|md|csv|json|srt|log)$/.test(name)) return handleTextFile(file);
    toast('目前支持 PDF、TXT、Markdown 和图片');
  }

  async function handleTextFile(file) {
    if (file.size > 5 * 1024 * 1024) return toast('文本文件请控制在 5MB 以内');
    live.source = 'file';
    $('#viewfinder').hidden = true;
    $('#capture-preview').hidden = true;
    $('#scan-overlay').hidden = true;
    $('#ocr-section').hidden = true;
    $('#capture-buttons').hidden = false;
    removeAddBar();
    showFileSummary(file.name, `TEXT · ${Math.max(1, Math.round(file.size / 1024))} KB`, '正在读取文字…');
    try {
      const text = await file.text();
      if (!dictReady) await loadDictionary();
      showOcrResults(text);
      $('#file-status').textContent = '已读取文字，勾选后加入词库';
    } catch (err) {
      console.error(err);
      $('#file-status').textContent = '读取失败，请换一个文件';
      toast('这个文件没能读取');
    }
  }

  async function renderPdfPage(page, maxWidth = 1600) {
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(2, maxWidth / base.width);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(viewport.width));
    canvas.height = Math.max(1, Math.floor(viewport.height));
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas;
  }

  async function handlePdfFile(file) {
    if (!window.pdfjsLib) return toast('PDF 组件没有载入，请刷新页面');
    if (file.size > 30 * 1024 * 1024) return toast('PDF 请控制在 30MB 以内');
    live.source = 'file';
    $('#viewfinder').hidden = true;
    $('#capture-preview').hidden = true;
    $('#file-summary').hidden = false;
    $('#scan-overlay').hidden = true;
    $('#ocr-section').hidden = true;
    $('#capture-buttons').hidden = true;
    removeAddBar();
    showFileSummary(file.name, 'PDF · 正在打开…', '正在读取页面');
    let pdf = null;
    try {
      if (!dictReady) await loadDictionary();
      const data = new Uint8Array(await file.arrayBuffer());
      pdf = await window.pdfjsLib.getDocument({ data }).promise;
      const total = pdf.numPages;
      const textPages = Math.min(total, 20);
      if (live.imageUrl) URL.revokeObjectURL(live.imageUrl);
      const firstCanvas = await renderPdfPage(await pdf.getPage(1), 1500);
      const previewBlob = await new Promise(resolve => firstCanvas.toBlob(resolve, 'image/jpeg', .9));
      live.imageUrl = URL.createObjectURL(previewBlob);
      $('#preview-img').src = live.imageUrl;
      $('#file-summary').hidden = true;
      $('#capture-preview').hidden = false;
      $('#scan-overlay').hidden = false;
      $('#scan-label').textContent = '正在读取 PDF 文字…';

      let text = '';
      for (let i = 1; i <= textPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str + (item.hasEOL ? '\n' : ' ')).join('') + '\n';
        $('#scan-label').textContent = `读取第 ${i} / ${textPages} 页…`;
      }

      if (text.replace(/[^A-Za-z]/g, '').length >= 12) {
        showOcrResults(text);
        if (total > textPages) toast(`只处理了前 ${textPages} 页`);
        return;
      }

      const worker = await ensureWorker();
      const ocrPages = Math.min(total, 4);
      let ocrText = '';
      for (let i = 1; i <= ocrPages; i++) {
        $('#scan-label').textContent = `扫描件：识别第 ${i} / ${ocrPages} 页…`;
        const page = await pdf.getPage(i);
        const canvas = await renderPdfPage(page, 1500);
        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .92));
        const processed = await preprocess(blob);
        const { data: result } = await worker.recognize(processed);
        ocrText += (result.text || '') + '\n';
      }
      if (!ocrText.trim()) throw new Error('no text');
      showOcrResults(ocrText);
      toast(`这个 PDF 没有文字层，已识别前 ${ocrPages} 页`);
    } catch (err) {
      console.error(err);
      $('#scan-overlay').hidden = true;
      $('#capture-buttons').hidden = false;
      $('#file-summary').hidden = false;
      $('#file-status').textContent = '没有提取到文字';
      toast('这份 PDF 没读出文字，可以试试截图后识别');
    } finally {
      if (pdf) pdf.destroy?.();
    }
  }

  function showOcrResults(text) {
    const items = extractWords(text);
    live.ocrResults = items.map(item => {
      const existing = byWord(item.word);
      const entry = item.entry;
      return {
        word: entry?.word || item.word,
        key: item.word,
        phone: entry?.phone || '',
        trans: entry?.trans || '',
        known: !!entry,
        rare: !entry || !entry.rank || entry.rank > RARE_RANK,
        form: item.form || '',
        existing: !!existing,
        count: item.count,
        selected: false,
      };
    });
    live.ocrResults.forEach(r => {
      if (r.rare && !r.existing) live.selected.add(r.key);
    });
    $('#scan-overlay').hidden = true;
    $('#capture-buttons').hidden = false;
    $('#ocr-section').hidden = false;
    $('#capture-aside').hidden = true;
    $('#ocr-empty').hidden = true;
    updateOcrHead();
    renderOcrList();
    renderAddBar();
    if (live.ocrResults.length && window.innerWidth < 720) {
      setTimeout(() => $('#ocr-section').scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
    }
  }

  function visibleOcrResults() {
    return live.ocrResults.filter(r => !live.rareOnly || r.rare);
  }

  function updateOcrHead() {
    const visible = visibleOcrResults();
    const all = live.ocrResults.length;
    if (!all) {
      $('#ocr-title').textContent = '识别结果';
      $('#ocr-sub').textContent = '没有找到可收录的单词';
      return;
    }
    $('#ocr-title').textContent = live.rareOnly ? `挑出 ${visible.length} 个生词` : `识别到 ${all} 个词`;
    $('#ocr-sub').textContent = live.rareOnly
      ? `共识别 ${all} 个词，已自动勾选可能不熟的`
      : '点一下单词可以勾选或取消';
  }

  function renderOcrList() {
    const box = $('#ocr-list');
    box.innerHTML = '';
    const visible = visibleOcrResults();
    for (const item of visible) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'ocr-row' + (live.selected.has(item.key) ? ' checked' : '');
      row.innerHTML = `<span class="check"><svg><use href="#i-check"/></svg></span><span class="ocr-main"><span class="ocr-word"><b></b><span></span></span><p class="ocr-trans"></p></span><span class="ocr-flag"></span>`;
      $('.ocr-word b', row).textContent = item.word;
      $('.ocr-word span', row).textContent = item.phone ? `/ ${item.phone} /` : (item.count > 1 ? `出现 ${item.count} 次` : '');
      $('.ocr-trans', row).textContent = item.trans || '词典里还没有这个词，可以先收录再补充释义';
      const flag = $('.ocr-flag', row);
      if (item.existing) {
        flag.textContent = '已在词库';
        flag.classList.add('known');
      } else if (!item.known) {
        flag.textContent = '未收录';
        flag.classList.add('raw');
      } else if (item.form) {
        flag.textContent = `原词 ${item.form}`;
      } else {
        flag.textContent = '生词';
      }
      row.addEventListener('click', () => {
        if (item.existing) return toast('这个词已经在词库里了');
        if (live.selected.has(item.key)) live.selected.delete(item.key);
        else live.selected.add(item.key);
        renderOcrList();
        renderAddBar();
      });
      box.appendChild(row);
    }
    const empty = $('#ocr-empty');
    if (!visible.length && live.ocrResults.length) {
      empty.hidden = false;
      empty.textContent = live.rareOnly ? '这一页多是常见词。点「只看生词」可以显示全部。' : '这次没有找到合适的单词，换个角度再试试。';
    } else {
      empty.hidden = visible.length > 0;
      empty.textContent = '这次没有找到合适的单词，换个角度再试试。';
    }
  }

  function removeAddBar() {
    $('.add-bar')?.remove();
  }

  function renderAddBar() {
    removeAddBar();
    if (!live.ocrResults.length) return;
    const bar = document.createElement('div');
    bar.className = 'add-bar';
    const n = live.selected.size;
    bar.innerHTML = `<span>已选 <b>${n}</b> 个词</span><button ${n ? '' : 'disabled'}>加入词库</button>`;
    $('button', bar).addEventListener('click', addSelectedWords);
    document.body.appendChild(bar);
  }

  function addSelectedWords() {
    let added = 0;
    for (const key of live.selected) {
      const item = live.ocrResults.find(r => r.key === key);
      if (!item || item.existing) continue;
      const w = addWord(item.word, item.trans, item.phone, live.source || 'photo');
      if (w) added += 1;
    }
    live.selected.clear();
    save();
    renderAll();
    renderOcrList();
    removeAddBar();
    if (!added) return toast('这些词已经在词库里了');
    toast(`收好了，词库 +${added}`);
    setTimeout(() => nav('library'), 500);
  }

  function resetCapture() {
    if (live.imageUrl) URL.revokeObjectURL(live.imageUrl);
    live.imageUrl = null;
    live.source = 'photo';
    live.ocrResults = [];
    live.selected.clear();
    $('#capture-preview').hidden = true;
    $('#viewfinder').hidden = false;
    $('#capture-buttons').hidden = false;
    $('#ocr-section').hidden = true;
    $('#capture-aside').hidden = false;
    $('#file-summary').hidden = true;
    $('#file-status').textContent = '';
    $('#ocr-list').innerHTML = '';
    $('#scan-overlay').hidden = false;
    removeAddBar();
    $('#file-camera').value = '';
    $('#file-gallery').value = '';
    $('#file-document').value = '';
  }

  /* ---------------- sheets ---------------- */

  function openSheet(html) {
    $('#sheet-content').innerHTML = html;
    $('#sheet-backdrop').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeSheet() {
    $('#sheet-backdrop').hidden = true;
    document.body.style.overflow = '';
  }

  function openClipboardSheet() {
    openSheet(`
      <h2>粘贴单词</h2>
      <p class="sheet-sub">从其他 App 复制单词或一段英文，粘贴到这里。iPad 上可以长按输入框选择「粘贴」。</p>
      <div class="field"><textarea id="clipboard-text" placeholder="例如：resilient, ephemeral, luminous"></textarea></div>
      <div class="sheet-actions">
        <button class="btn btn-soft" id="clipboard-cancel">取消</button>
        <button class="btn btn-primary" id="clipboard-extract">提取单词</button>
      </div>
    `);
    $('#clipboard-cancel').addEventListener('click', closeSheet);
    $('#clipboard-extract').addEventListener('click', async () => {
      const text = $('#clipboard-text').value.trim();
      if (!text) return toast('先粘贴一些文字');
      closeSheet();
      live.source = 'clipboard';
      if (!dictReady) await loadDictionary();
      showOcrResults(text);
    });
    setTimeout(() => $('#clipboard-text').focus(), 250);
  }

  async function importFromClipboard() {
    try {
      if (!navigator.clipboard?.readText) throw new Error('clipboard unavailable');
      const text = await navigator.clipboard.readText();
      if (!text.trim()) return toast('剪贴板里没有文字');
      live.source = 'clipboard';
      if (!dictReady) await loadDictionary();
      showOcrResults(text);
    } catch {
      openClipboardSheet();
    }
  }

  function openAddSheet(prefill = null) {
    openSheet(`
      <h2>收一个新词</h2>
      <p class="sheet-sub">输入单词，会自动带出释义。也可以只填单词。</p>
      <div class="field"><label for="manual-word">单词</label><input id="manual-word" placeholder="例如：serendipity" autocomplete="off" autocapitalize="off" spellcheck="false"></div>
      <div class="field"><label for="manual-trans">中文释义</label><textarea id="manual-trans" placeholder="输入释义，或留给词典自动补全"></textarea></div>
      <div class="sheet-actions">
        <button class="btn btn-soft" id="cancel-add">取消</button>
        <button class="btn btn-primary" id="save-add">加入词库</button>
      </div>
    `);
    const wordInput = $('#manual-word');
    const transInput = $('#manual-trans');
    let autoFilled = false;
    if (prefill) {
      wordInput.value = prefill.word || '';
      transInput.value = prefill.trans || '';
    }
    const fill = () => {
      const entry = lookup(wordInput.value.trim());
      if (entry && (!transInput.value.trim() || autoFilled)) {
        transInput.value = entry.trans;
        autoFilled = true;
      }
    };
    wordInput.addEventListener('input', fill);
    transInput.addEventListener('input', () => { autoFilled = false; });
    $('#cancel-add').addEventListener('click', closeSheet);
    $('#save-add').addEventListener('click', () => {
      const word = wordInput.value.trim();
      if (!word) return wordInput.focus();
      if (byWord(word)) return toast('这个词已经在词库里了');
      const entry = lookup(word);
      const w = addWord(word, transInput.value.trim() || entry?.trans || '', entry?.phone || '', 'manual');
      if (!w) return toast('单词格式不太对，再检查一下');
      closeSheet();
      toast(`收好了：${w.word}`);
      renderAll();
      if (activeScreen !== 'library') nav('library');
    });
    setTimeout(() => wordInput.focus(), 250);
  }

  function openDetail(id) {
    const w = state.words.find(x => x.id === id);
    if (!w) return;
    const status = w.status === 'mastered' ? '已掌握' : (w.due <= Date.now() ? '待复习' : '学习中');
    openSheet(`
      <div class="detail-word">
        <div><h2 id="detail-title"></h2><p class="detail-phone" id="detail-phone"></p></div>
        <button class="sound-mini" id="detail-sound" style="width:40px;height:40px"><svg><use href="#i-sound"/></svg></button>
      </div>
      <div class="detail-trans" id="detail-trans"></div>
      <div class="detail-meta">
        <span>${status}</span>
        <span>复习 ${w.reviews} 次</span>
        <span>收录于 ${new Date(w.addedAt).getMonth() + 1}月${new Date(w.addedAt).getDate()}日</span>
      </div>
      <div class="detail-extra" id="detail-extra">
        <p class="extra-loading">正在载入例句和派生词…</p>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-soft" id="detail-edit"><svg><use href="#i-edit"/></svg>编辑</button>
        <button class="btn btn-danger" id="detail-del"><svg><use href="#i-trash"/></svg>删除</button>
      </div>
    `);
    $('#detail-title').textContent = w.word;
    $('#detail-phone').textContent = w.phone ? `/ ${w.phone} /` : '还没有音标';
    $('#detail-trans').textContent = w.trans || '待补充释义';
    $('#detail-sound').addEventListener('click', () => speak(w.word));
    $('#detail-edit').addEventListener('click', () => openEditSheet(w.id));
    $('#detail-del').addEventListener('click', () => {
      if (!confirm(`从词库删除 “${w.word}”？`)) return;
      state.words = state.words.filter(x => x.id !== w.id);
      save();
      closeSheet();
      renderAll();
      toast('已经删除');
    });
    const token = ++detailExtraToken;
    loadExtras().then(() => {
      if (token === detailExtraToken && !$('#sheet-backdrop').hidden) renderDetailExtra(id);
    });
  }

  function highlightWord(sentence, word) {
    const safe = escapeHtml(sentence);
    const escaped = escapeHtml(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return safe.replace(new RegExp(`\\b${escaped}\\b`, 'ig'), '<mark>$&</mark>');
  }

  function renderDetailExtra(id) {
    const w = state.words.find(x => x.id === id);
    const box = $('#detail-extra');
    if (!w || !box) return;
    if (!extrasReady) {
      box.innerHTML = '<p class="extra-loading">拓展暂时无法载入</p>';
      return;
    }
    const key = w.word.toLowerCase();
    const sentence = extras.sentences[key] || '';
    const forms = [...new Set((extras.forms[key] || []).filter(f => f.toLowerCase() !== key && lookup(f)))].slice(0, 6);
    box.innerHTML = `
      <div class="detail-section">
        <div class="detail-section-head">
          <h3>例句</h3>
          ${sentence ? '<button class="sound-mini" id="detail-example-sound" style="width:32px;height:32px"><svg><use href="#i-sound"/></svg></button>' : ''}
        </div>
        ${sentence ? `<p class="example-sentence">${highlightWord(sentence, w.word)}</p><p class="extra-source">例句数据：Tatoeba · CC BY 2.0 FR / 基础词库</p>` : '<p class="extra-empty">这个词暂时没有例句。</p>'}
      </div>
      <div class="detail-section">
        <div class="detail-section-head"><h3>派生词</h3></div>
        ${forms.length ? `<div class="derivative-list">${forms.map(f => {
          const entry = lookup(f);
          const exists = byWord(f);
          return `<button class="derivative-chip${exists ? ' is-added' : ''}" data-form="${escapeHtml(f)}"><b>${escapeHtml(f)}</b><small>${escapeHtml(entry.trans)}</small><span class="deriv-state">${exists ? '已在词库' : '+ 收录'}</span></button>`;
        }).join('')}</div>` : '<p class="extra-empty">暂时没有可用的派生词。</p>'}
      </div>
    `;
    if (sentence) $('#detail-example-sound').addEventListener('click', () => speak(sentence));
    $$('.derivative-chip', box).forEach(chip => chip.addEventListener('click', () => {
      const form = chip.dataset.form;
      const existing = byWord(form);
      if (existing) return openDetail(existing.id);
      const entry = lookup(form);
      if (!entry) return;
      const added = addWord(form, entry.trans, entry.phone, 'derivative');
      if (!added) return;
      save();
      renderAll();
      toast(`收进词库：${added.word}`);
      renderDetailExtra(id);
    }));
  }

  function openEditSheet(id) {
    const w = state.words.find(x => x.id === id);
    if (!w) return;
    openSheet(`
      <h2>编辑单词</h2>
      <p class="sheet-sub">释义可以按自己的理解来写。</p>
      <div class="field"><label for="edit-word">单词</label><input id="edit-word"></div>
      <div class="field"><label for="edit-trans">中文释义</label><textarea id="edit-trans"></textarea></div>
      <div class="sheet-actions">
        <button class="btn btn-soft" id="cancel-edit">取消</button>
        <button class="btn btn-primary" id="save-edit">保存</button>
      </div>
    `);
    $('#edit-word').value = w.word;
    $('#edit-trans').value = w.trans;
    $('#cancel-edit').addEventListener('click', closeSheet);
    $('#save-edit').addEventListener('click', () => {
      const nextWord = $('#edit-word').value.trim();
      if (!nextWord) return;
      const dup = byWord(nextWord);
      if (dup && dup.id !== w.id) return toast('词库里已经有这个单词了');
      w.word = nextWord;
      w.trans = $('#edit-trans').value.trim() || '待补充释义';
      save();
      closeSheet();
      renderAll();
      toast('已保存');
    });
  }

  function openSettings() {
    openSheet(`
      <h2>设置</h2>
      <p class="sheet-sub">把节奏调成适合自己的样子。</p>
      <div class="settings-row">
        <div><b>每日目标</b><small>每天想推进的单词数</small></div>
        <div class="goal-stepper"><button id="goal-minus">−</button><span id="goal-value">${state.settings.dailyGoal}</span><button id="goal-plus">+</button></div>
      </div>
      <div class="settings-row">
        <div><b>离线识别</b><small>拍照后在本机识别，图片不会上传</small></div>
        <span class="mini-pill mastered">本地运行</span>
      </div>
      <div class="settings-row">
        <div><b>分享收词</b><small>在 iPad 分享菜单里加入拾词</small></div>
        <button class="text-btn" id="btn-share-guide" style="color:var(--green);font-weight:700">设置方法</button>
      </div>
      <div class="settings-row">
        <div><b>备份与迁移</b><small>换网址或设备前先导出</small></div>
        <div class="backup-actions"><button class="text-btn" id="btn-export-backup">导出</button><button class="text-btn" id="btn-import-backup">导入</button></div>
      </div>
      <div class="settings-row">
        <div><b>离线准备</b><small>把词典和识别模型存到 iPad</small></div>
        <button class="text-btn" id="btn-offline-prep">准备</button>
      </div>
      <div class="settings-row"><div><b>添加到主屏幕</b><small>像普通 App 一样全屏打开</small></div><button class="text-btn" id="btn-install" style="color:var(--green);font-weight:700">${deferredInstall ? '安装' : '查看方法'}</button></div>
      <p class="install-note" id="install-note" hidden>在 Safari 中点击工具栏的「分享」按钮，选择「添加到主屏幕」，再点右上角「添加」。</p>
      <button class="danger-link" id="btn-reset">清空所有数据，重新开始</button>
      <p style="text-align:center;font-size:9.5px;color:var(--ink-faint);margin:26px 0 0;letter-spacing:.1em">拾词 0.5 · PROTOTYPE</p>
      <p style="text-align:center;font-size:8.5px;color:var(--ink-faint);margin:8px 0 0">例句数据：Tatoeba（CC BY 2.0 FR）与基础词库</p>
    `);
    const updateGoal = (delta) => {
      state.settings.dailyGoal = Math.max(5, Math.min(50, state.settings.dailyGoal + delta));
      $('#goal-value').textContent = state.settings.dailyGoal;
      save();
      renderToday();
    };
    $('#goal-minus').addEventListener('click', () => updateGoal(-5));
    $('#goal-plus').addEventListener('click', () => updateGoal(5));
    $('#btn-share-guide')?.addEventListener('click', openShareGuide);
    $('#btn-export-backup')?.addEventListener('click', openBackupExport);
    $('#btn-import-backup')?.addEventListener('click', openBackupImport);
    $('#btn-offline-prep')?.addEventListener('click', prepareOffline);
    $('#btn-install')?.addEventListener('click', async () => {
      if (!deferredInstall) {
        $('#install-note').hidden = !$('#install-note').hidden;
        return;
      }
      deferredInstall.prompt();
      await deferredInstall.userChoice;
      deferredInstall = null;
      closeSheet();
    });
    $('#btn-reset').addEventListener('click', () => {
      if (!confirm('会删除词库、复习记录和设置，确定重新开始吗？')) return;
      localStorage.removeItem(STORE_KEY);
      location.reload();
    });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('已复制');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.appendChild(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      toast('已复制');
    }
  }

  function openShareGuide() {
    const api = `${location.origin}/api/inbox`;
    const body = `{"token":"${SHARE_TOKEN}","text":"快捷指令输入"}`;
    openSheet(`
      <h2>从其他 App 收词</h2>
      <p class="sheet-sub">用 iOS 快捷指令把选中的单词发到拾词，它会出现在系统分享菜单里。</p>
      ${shareApiAvailable === false ? '<p class="guide-warning">当前网址是静态托管，没有连接收词接口。请使用电脑上的拾词地址，或先部署一个后端服务。</p>' : ''}
      <ol class="guide-steps">
        <li><b>新建快捷指令</b><span>打开「快捷指令」→ 新建。在快捷指令设置里开启「在分享表单中显示」，接收类型选「文本」。</span></li>
        <li><b>添加「获取 URL 内容」</b><span>URL 填下面的接口地址，方法选 POST，请求头加 Content-Type: application/json。</span></li>
        <li><b>设置 JSON 请求体</b><span>用「字典」动作：token 填 <code>${SHARE_TOKEN}</code>，text 选择「快捷指令输入」。</span></li>
        <li><b>命名并保存</b><span>命名为「加入拾词」。以后在 Safari、Books 等 App 里选中单词 → 分享 → 加入拾词。</span></li>
      </ol>
      <div class="guide-block">
        <label>收词接口</label>
        <code id="share-api"></code>
        <button class="text-btn" id="share-copy-api">复制</button>
      </div>
      <div class="guide-block">
        <label>请求体模板</label>
        <code id="share-body"></code>
        <button class="text-btn" id="share-copy-body">复制</button>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-soft" id="share-close">关闭</button>
        <button class="btn btn-primary" id="share-test">发送测试</button>
      </div>
      <p class="guide-note">需要 iPad 与电脑在同一 Wi-Fi，且拾词服务保持运行。真正的原生 Share Extension 需要 Mac + Xcode 编译。</p>
    `);
    $('#share-api').textContent = api;
    $('#share-body').textContent = body;
    $('#share-copy-api').addEventListener('click', () => copyText(api));
    $('#share-copy-body').addEventListener('click', () => copyText(body));
    $('#share-close').addEventListener('click', closeSheet);
    $('#share-test').addEventListener('click', async () => {
      try {
        const res = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: SHARE_TOKEN, text: 'eloquent pragmatic' }),
        });
        if (!res.ok) throw new Error('request failed');
        await syncShareInbox();
        toast('测试已发送，看看词库有没有收进新词');
      } catch {
        toast('测试失败，请确认电脑上的拾词服务正在运行');
      }
    });
  }

  function backupPayload() {
    return JSON.stringify({
      version: 1,
      exportedAt: new Date().toISOString(),
      words: state.words,
      notes: state.notes,
      settings: state.settings,
      stats: state.stats,
    }, null, 2);
  }

  function openBackupExport() {
    const payload = backupPayload();
    openSheet(`
      <h2>导出备份</h2>
      <p class="sheet-sub">换 GitHub Pages 地址或换设备前，先复制这份备份，再到新地址里导入。</p>
      <textarea class="backup-text" id="backup-text" readonly></textarea>
      <div class="backup-actions">
        <button class="btn btn-soft" id="backup-select">全选</button>
        <button class="btn btn-primary" id="backup-copy">复制备份</button>
      </div>
      <div class="sheet-actions"><button class="btn btn-soft" id="backup-close">关闭</button></div>
    `);
    $('#backup-text').value = payload;
    $('#backup-select').addEventListener('click', () => {
      $('#backup-text').focus();
      $('#backup-text').select();
    });
    $('#backup-copy').addEventListener('click', () => copyText(payload));
    $('#backup-close').addEventListener('click', closeSheet);
  }

  function openBackupImport() {
    openSheet(`
      <h2>导入备份</h2>
      <p class="sheet-sub">把之前复制的备份粘贴到这里。导入会覆盖当前词库和笔记。</p>
      <textarea class="backup-text" id="backup-input" placeholder="在这里粘贴备份 JSON"></textarea>
      <div class="sheet-actions">
        <button class="btn btn-soft" id="backup-cancel">取消</button>
        <button class="btn btn-primary" id="backup-import">导入</button>
      </div>
    `);
    $('#backup-cancel').addEventListener('click', closeSheet);
    $('#backup-import').addEventListener('click', () => {
      const raw = $('#backup-input').value.trim();
      if (!raw) return toast('先粘贴备份内容');
      let data;
      try {
        data = JSON.parse(raw);
      } catch {
        return toast('备份格式不正确');
      }
      const words = Array.isArray(data) ? data : data.words;
      if (!Array.isArray(words)) return toast('没有找到词库数据');
      if (!confirm('导入会覆盖当前词库和笔记，确定继续吗？')) return;
      state.words = words.filter(w => w && w.word).map(w => ({
        ...w,
        id: w.id || uid(),
        status: w.status || 'new',
        interval: w.interval || 0,
        due: w.due || Date.now(),
        ease: w.ease || 2.5,
        reviews: w.reviews || 0,
        correct: w.correct || 0,
        addedAt: w.addedAt || Date.now(),
        source: w.source || 'import',
      }));
      state.notes = Array.isArray(data.notes) ? data.notes : [];
      state.settings = Object.assign({ dailyGoal: 10 }, data.settings || {});
      state.stats = Object.assign({ studyDates: [], reviewedToday: { date: dateKey(), count: 0 }, totalReviews: 0, correct: 0 }, data.stats || {});
      if (state.stats.reviewedToday.date !== dateKey()) state.stats.reviewedToday = { date: dateKey(), count: 0 };
      currentNoteId = null;
      save();
      closeSheet();
      renderAll();
      toast(`导入完成：${state.words.length} 个单词`);
    });
  }

  async function prepareOffline() {
    const btn = $('#btn-offline-prep');
    const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    if (!('serviceWorker' in navigator) || !secure) {
      toast('离线缓存需要 HTTPS，请在 GitHub Pages 版中使用');
      return;
    }
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!reg.active) {
        toast('服务还没准备好，刷新页面后再试');
        return;
      }
      const urls = [
        'dict.json',
        'extra.json',
        'sample-page.jpg',
        'vendor/lang/eng.traineddata.gz',
        'vendor/core/tesseract-core-simd-lstm.wasm.js',
        'vendor/core/tesseract-core-simd-lstm.wasm',
        'vendor/core/tesseract-core-lstm.wasm.js',
        'vendor/core/tesseract-core-lstm.wasm',
        'vendor/pdf/pdf.min.js',
        'vendor/pdf/pdf.worker.min.js',
      ];
      btn.disabled = true;
      btn.textContent = '准备中…';
      toast('正在下载离线资源，请保持页面打开');
      const channel = new MessageChannel();
      const reset = () => {
        btn.disabled = false;
        btn.textContent = '已准备';
      };
      channel.port1.onmessage = event => {
        reset();
        const failed = event.data?.failed || 0;
        toast(failed ? `完成，${failed} 个资源未缓存` : '离线资源已准备好，可以在没有网络时打开');
      };
      reg.active.postMessage({ type: 'CACHE_URLS', urls }, [channel.port2]);
      setTimeout(() => {
        if (btn.disabled) reset();
      }, 180000);
    } catch {
      btn.disabled = false;
      btn.textContent = '准备';
      toast('离线准备失败，请刷新后再试');
    }
  }

  /* ---------------- review ---------------- */

  const SYNONYM_SEEDS = [
    ['brief', 'short', 'ephemeral', 'fleeting', 'transient', 'momentary'],
    ['calm', 'tranquil', 'serene', 'peaceful', 'quiet', 'still'],
    ['important', 'crucial', 'vital', 'essential', 'significant'],
    ['happy', 'glad', 'joyful', 'delighted', 'pleased'],
    ['sad', 'unhappy', 'sorrowful', 'gloomy', 'melancholy'],
    ['big', 'large', 'huge', 'enormous', 'vast'],
    ['small', 'tiny', 'little', 'minute'],
    ['difficult', 'hard', 'tough', 'challenging'],
    ['easy', 'simple', 'effortless', 'straightforward'],
    ['beautiful', 'pretty', 'lovely', 'gorgeous'],
    ['smart', 'clever', 'intelligent', 'bright'],
    ['brave', 'courageous', 'fearless', 'bold'],
    ['fast', 'quick', 'rapid', 'swift'],
    ['begin', 'start', 'commence'],
    ['end', 'finish', 'conclude'],
    ['help', 'assist', 'aid'],
    ['show', 'demonstrate', 'display', 'illustrate'],
    ['think', 'believe', 'consider', 'suppose'],
    ['angry', 'furious', 'mad', 'rage'],
    ['rich', 'wealthy', 'affluent'],
    ['poor', 'impoverished', 'needy'],
    ['strange', 'odd', 'peculiar', 'weird'],
    ['old', 'ancient', 'aged'],
    ['new', 'novel', 'fresh', 'modern'],
    ['strong', 'powerful', 'sturdy', 'robust'],
    ['weak', 'fragile', 'feeble'],
    ['resilient', 'tough', 'hardy', 'adaptable'],
    ['pragmatic', 'practical', 'realistic', 'sensible'],
    ['eloquent', 'articulate', 'fluent', 'expressive'],
    ['meticulous', 'careful', 'thorough', 'precise'],
    ['luminous', 'bright', 'radiant', 'glowing'],
    ['compassion', 'sympathy', 'empathy', 'kindness'],
    ['curiosity', 'inquisitiveness', 'interest'],
    ['perseverance', 'persistence', 'tenacity', 'determination'],
  ].map(list => new Set(list.map(w => w.toLowerCase())));

  function shuffleList(list) {
    return [...list].sort(() => Math.random() - .5);
  }

  function meaningGrams(translation) {
    const text = String(translation || '')
      .replace(/[a-zA-Z.]+/g, ' ')
      .replace(/[（(][^）)]*[）)]/g, ' ')
      .replace(/[，,；;。.、:：()（）【】[\]\s]+/g, '');
    const grams = new Set();
    for (let i = 0; i < text.length - 1; i++) {
      if (/[\u4e00-\u9fa5]/.test(text[i]) && /[\u4e00-\u9fa5]/.test(text[i + 1])) {
        grams.add(text[i] + text[i + 1]);
      }
    }
    return grams;
  }

  function meaningScore(a, b) {
    const wa = a.word.toLowerCase();
    const wb = b.word.toLowerCase();
    if (SYNONYM_SEEDS.some(set => set.has(wa) && set.has(wb))) return 1;
    const ga = meaningGrams(a.trans);
    const gb = meaningGrams(b.trans);
    if (!ga.size || !gb.size) return 0;
    let common = 0;
    for (const gram of ga) if (gb.has(gram)) common += 1;
    return common / (ga.size + gb.size - common);
  }

  function levenshtein(a, b) {
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let prev = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const temp = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
        prev = temp;
      }
    }
    return row[b.length];
  }

  function spellingScore(a, b) {
    const wa = a.word.toLowerCase();
    const wb = b.word.toLowerCase();
    if (Math.abs(wa.length - wb.length) > 2) return 0;
    const dist = levenshtein(wa, wb);
    const minLen = Math.min(wa.length, wb.length);
    const maxLen = Math.max(wa.length, wb.length);
    let samePos = 0;
    for (let i = 0; i < minLen; i++) if (wa[i] === wb[i]) samePos += 1;
    if (dist <= 1) return 1 - dist / maxLen;
    if (dist === 2 && minLen <= 5 && samePos >= 2) return 1 - dist / maxLen;
    if (dist === 2 && samePos >= Math.max(3, Math.ceil(minLen * .6))) return 1 - dist / maxLen;
    let prefix = 0;
    while (prefix < minLen && wa[prefix] === wb[prefix]) prefix += 1;
    if (prefix >= 3 && Math.abs(wa.length - wb.length) <= 2) return .55;
    return 0;
  }

  function commonMeaningLabel(group) {
    const counts = new Map();
    for (const word of group) {
      for (const gram of meaningGrams(word.trans)) {
        counts.set(gram, (counts.get(gram) || 0) + 1);
      }
    }
    const skip = new Set(['表示', '一种', '事物', '状态', '性质', '的人', '使人', '进行', '某个', '可以', '一个']);
    return [...counts.entries()]
      .filter(([gram, count]) => count >= 2 && !skip.has(gram) && !gram.endsWith('的') && !gram.startsWith('的'))
      .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
      .slice(0, 1)
      .map(([gram]) => gram)
      .join('');
  }

  function clusterWords(pool, scoreFn, threshold) {
    const remaining = new Set(pool.map(w => w.id));
    const groups = [];
    for (const word of pool) {
      if (!remaining.has(word.id)) continue;
      const candidates = pool
        .filter(x => x.id !== word.id && remaining.has(x.id))
        .map(x => ({ word: x, score: scoreFn(word, x) }))
        .filter(x => x.score >= threshold)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      const group = [word, ...candidates.map(x => x.word)];
      group.forEach(w => remaining.delete(w.id));
      groups.push(group);
    }
    return groups;
  }

  function buildGroupedQueue(layout) {
    const due = dueList();
    const dueIds = new Set(due.map(w => w.id));
    const pool = [...due, ...state.words.filter(w => !dueIds.has(w.id))].slice(0, 50);
    if (!pool.length) return { queue: [], groups: {} };
    const groups = clusterWords(pool, layout === 'meaning' ? meaningScore : spellingScore, layout === 'meaning' ? .16 : .5);
    groups.sort((a, b) => (b.length > 1) - (a.length > 1));
    const queue = [];
    const groupMap = {};
    for (const group of groups) {
      if (queue.length >= 20) break;
      const take = group.slice(0, 20 - queue.length);
      const info = {
        type: layout,
        words: group.map(w => w.word),
        label: layout === 'meaning' ? (commonMeaningLabel(group) || '意思相近') : '拼写相似',
      };
      for (const word of take) {
        queue.push(word);
        groupMap[word.id] = info;
      }
    }
    return { queue, groups: groupMap };
  }

  function startReview(layout = reviewLayout) {
    if (typeof layout !== 'string' || !['random', 'meaning', 'spelling'].includes(layout)) layout = 'random';
    reviewLayout = layout;
    let queue;
    let groups = {};
    let freeMode = false;
    if (layout === 'random') {
      const due = dueList();
      const pool = due.length ? due : [...state.words];
      queue = shuffleList(pool).slice(0, 20);
      freeMode = !due.length;
    } else {
      const built = buildGroupedQueue(layout);
      queue = built.queue;
      groups = built.groups;
      freeMode = dueList().length === 0;
    }
    if (!queue.length) return toast('词库还是空的，先去收一个词吧');
    reviewSession = { queue, groups, layout, idx: 0, flipped: false, mode: 'recall', locked: false, answerRevealed: false, counts: { again: 0, hard: 0, good: 0 }, answered: 0, freeMode };
    $('#review-overlay').hidden = false;
    $('#review-body').hidden = false;
    $('#review-done').hidden = true;
    document.body.style.overflow = 'hidden';
    renderReviewCard();
  }

  function renderReviewCard() {
    const s = reviewSession;
    if (!s) return;
    if (s.idx >= s.queue.length) return finishReview();
    const w = s.queue[s.idx];
    const mode = s.mode || 'recall';
    s.flipped = false;
    s.answerRevealed = false;
    $('#flashcard').classList.remove('flipped');
    $('#flashcard').hidden = mode !== 'recall';
    $('#spell-panel').hidden = mode !== 'spell';
    $('#write-panel').hidden = mode !== 'write';
    $('#rate-row').hidden = true;
    $('#reveal-tip').hidden = mode !== 'recall';
    $$('#review-modes [data-mode]').forEach(b => b.classList.toggle('is-active', b.dataset.mode === mode));
    $('#review-kicker').textContent = mode === 'spell' ? '看释义，拼单词' : (mode === 'write' ? '听发音，默写单词' : '看单词，想意思');
    $('#review-counter').textContent = `${s.idx + 1} / ${s.queue.length}`;
    $('#review-progress-bar').style.width = `${(s.idx / s.queue.length) * 100}%`;
    if (mode === 'recall') {
      $('#reveal-tip').hidden = false;
      $('#flash-tag').textContent = s.freeMode ? '自由复习' : (w.status === 'new' ? '新词' : '到期复习');
      $('#flash-word').textContent = w.word;
      $('#flash-word-back').textContent = w.word;
      $('#flash-phone').textContent = w.phone ? `/ ${w.phone} /` : 'tap to reveal';
      $('#flash-phone-back').textContent = w.phone ? `/ ${w.phone} /` : '';
      $('#flash-trans').textContent = w.trans || '待补充释义';
    } else if (mode === 'spell') {
      prepareSpell(w);
    } else {
      prepareWrite(w);
    }
    renderReviewGroup();
  }

  function flipCard() {
    if (!reviewSession || reviewSession.mode !== 'recall') return;
    reviewSession.flipped = !reviewSession.flipped;
    reviewSession.answerRevealed = reviewSession.flipped;
    $('#flashcard').classList.toggle('flipped', reviewSession.flipped);
    $('#rate-row').hidden = !reviewSession.flipped;
    $('#reveal-tip').hidden = reviewSession.flipped;
    renderReviewGroup();
  }

  function setReviewMode(mode) {
    if (!reviewSession || !['recall', 'spell', 'write'].includes(mode)) return;
    reviewSession.mode = mode;
    renderReviewCard();
  }

  function renderReviewGroup() {
    const s = reviewSession;
    if (!s) return;
    const word = s.queue[s.idx];
    const group = word && s.groups ? s.groups[word.id] : null;
    const el = $('#review-group');
    if (!group || !group.words || group.words.length < 2) {
      el.hidden = true;
      return;
    }
    el.hidden = false;
    const groupSuffix = group.type === 'meaning' && group.label && group.label !== '意思相近' ? ` · ${group.label}` : '';
    $('#review-group-label').textContent = (group.type === 'meaning' ? '近义串记' : '形近串记') + groupSuffix;
    if (s.mode !== 'recall' && !s.answerRevealed) {
      $('#review-group-words').textContent = `同组 ${group.words.length} 个词，答完可见`;
      return;
    }
    const current = word.word.toLowerCase();
    $('#review-group-words').innerHTML = group.words.map(item => {
      const safe = escapeHtml(item);
      return item.toLowerCase() === current ? `<b>${safe}</b>` : safe;
    }).join(' · ');
  }

  const activeWord = () => reviewSession ? reviewSession.queue[reviewSession.idx] : null;

  function prepareSpell(w) {
    Object.assign(spellState, { target: w.word, checked: false, hadError: false, hintUsed: false, rating: 'good' });
    $('#spell-trans').textContent = w.trans || '待补充释义';
    const letters = w.word.replace(/[^A-Za-z]/g, '').length;
    $('#spell-hint').textContent = `共 ${letters} 个字母${/[ -]/.test(w.word) ? ' · 含空格或连字符' : ''}`;
    $('#spell-input').value = '';
    $('#spell-input').disabled = false;
    $('#spell-input').classList.remove('is-correct', 'is-wrong');
    $('#spell-feedback').hidden = true;
    $('#spell-feedback').className = 'spell-feedback';
    $('#spell-feedback').innerHTML = '';
    $('#spell-actions').hidden = false;
    $('#spell-after').hidden = true;
    $('#spell-check').disabled = false;
    $('#spell-hint-btn').disabled = false;
    $('#spell-hint-btn').textContent = '提示首字母';
    $('#spell-next').textContent = '下一个';
    setTimeout(() => {
      if (reviewSession?.mode === 'spell') $('#spell-input').focus({ preventScroll: true });
    }, 220);
  }

  function diffTarget(input, target) {
    const a = String(input).toLowerCase();
    return [...target].map((ch, i) => {
      if (ch === ' ') return '&nbsp;';
      const ok = a[i] === ch.toLowerCase();
      return `<span class="diff-letter${ok ? '' : ' bad'}">${escapeHtml(ch)}</span>`;
    }).join('');
  }

  function checkSpelling() {
    const w = activeWord();
    if (!w) return;
    const input = $('#spell-input');
    const value = input.value.trim().replace(/\s+/g, ' ');
    if (!value) {
      toast('先拼一个答案再检查');
      input.focus({ preventScroll: true });
      return;
    }
    const ok = value.toLowerCase() === w.word.toLowerCase();
    spellState.checked = true;
    if (reviewSession) {
      reviewSession.answerRevealed = true;
      renderReviewGroup();
    }
    input.disabled = true;
    $('#spell-check').disabled = true;
    $('#spell-actions').hidden = true;
    $('#spell-after').hidden = false;
    const feedback = $('#spell-feedback');
    feedback.hidden = false;
    input.classList.toggle('is-correct', ok);
    input.classList.toggle('is-wrong', !ok);
    if (ok) {
      spellState.rating = (spellState.hintUsed || spellState.hadError) ? 'hard' : 'good';
      feedback.className = 'spell-feedback ok';
      feedback.innerHTML = `拼写正确。<small>${spellState.hintUsed ? '用过提示，记为“有点印象”' : '拼写和记忆都对上了'}</small>`;
      $('#spell-hint').textContent = spellState.hintUsed ? '下次试着自己拼完整' : '记住这个拼写';
      $('#spell-next').textContent = '下一个';
    } else {
      spellState.hadError = true;
      spellState.rating = 'again';
      feedback.className = 'spell-feedback bad';
      feedback.innerHTML = `还差一点。正确拼写：<div class="answer-line">${diffTarget(value, w.word)}</div><small>你的答案：${escapeHtml(value)} · 标红的位置再留意一下</small>`;
      $('#spell-hint').textContent = '可以再试一次，或者先去复习别的词';
      $('#spell-next').textContent = '下一个 · 10 分钟后再见';
    }
  }

  function retrySpelling() {
    $('#spell-input').disabled = false;
    $('#spell-input').value = '';
    $('#spell-input').classList.remove('is-correct', 'is-wrong');
    $('#spell-feedback').hidden = true;
    $('#spell-feedback').className = 'spell-feedback';
    $('#spell-actions').hidden = false;
    $('#spell-after').hidden = true;
    $('#spell-check').disabled = false;
    $('#spell-next').textContent = '下一个';
    $('#spell-input').focus({ preventScroll: true });
  }

  function spellHint() {
    const w = activeWord();
    if (!w) return;
    spellState.hintUsed = true;
    const input = $('#spell-input');
    input.value = w.word[0] || '';
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
    $('#spell-hint-btn').disabled = true;
    $('#spell-hint-btn').textContent = '已提示';
  }

  function prepareWrite(w) {
    Object.assign(writing, { strokes: [], current: null, activeId: null, tool: 'pen', penUsed: false, revealed: false });
    $$('.writing-tool').forEach(b => b.classList.toggle('is-active', b.dataset.tool === 'pen'));
    $('#write-trans').textContent = w.trans || '待补充释义';
    $('#write-answer-word').textContent = w.word;
    $('#write-answer-phone').textContent = w.phone ? `/ ${w.phone} /` : '';
    $('#write-answer').hidden = true;
    $('#write-actions').hidden = false;
    $('#write-grade').hidden = true;
    $('#write-hint').textContent = '写完后点「对答案」，对照着检查';
    $('#write-canvas').style.pointerEvents = 'auto';
    requestAnimationFrame(() => {
      resizeCanvas();
      updateWritingPlaceholder();
    });
    setTimeout(() => {
      if (reviewSession?.mode === 'write' && activeWord()?.id === w.id) speak(w.word);
    }, 420);
  }

  function canvasRect() {
    return $('#write-canvas').getBoundingClientRect();
  }

  function resizeCanvas() {
    const canvas = $('#write-canvas');
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    redrawWriting();
  }

  function redrawWriting() {
    const canvas = $('#write-canvas');
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    ctx.clearRect(0, 0, rect.width, rect.height);
    for (const stroke of writing.strokes) {
      ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
      if (stroke.points.length === 1) {
        const p = stroke.points[0];
        ctx.fillStyle = '#20312a';
        ctx.beginPath();
        ctx.arc(p.x * rect.width, p.y * rect.height, stroke.tool === 'eraser' ? 9 : 1.7, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      for (let i = 1; i < stroke.points.length; i++) {
        const a = stroke.points[i - 1];
        const b = stroke.points[i];
        const pressure = b.p ?? .5;
        const width = stroke.tool === 'eraser' ? 20 : 2.2 * (.65 + pressure * .85);
        ctx.strokeStyle = '#20312a';
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.x * rect.width, a.y * rect.height);
        ctx.lineTo(b.x * rect.width, b.y * rect.height);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  function updateWritingPlaceholder() {
    $('#writing-placeholder').hidden = writing.strokes.length > 0;
  }

  function resetWritingReveal() {
    writing.revealed = false;
    $('#write-answer').hidden = true;
    $('#write-actions').hidden = false;
    $('#write-grade').hidden = true;
    $('#write-hint').textContent = '写完后点「对答案」，对照着检查';
  }

  function undoWriting() {
    if (!writing.strokes.length) return;
    writing.strokes.pop();
    redrawWriting();
    updateWritingPlaceholder();
    resetWritingReveal();
  }

  function clearWriting() {
    writing.strokes = [];
    writing.current = null;
    writing.activeId = null;
    redrawWriting();
    updateWritingPlaceholder();
    resetWritingReveal();
  }

  function revealWriting() {
    if (!writing.strokes.length) return toast('先在画布上写一写，再对答案');
    writing.revealed = true;
    if (reviewSession) {
      reviewSession.answerRevealed = true;
      renderReviewGroup();
    }
    $('#write-answer').hidden = false;
    $('#write-actions').hidden = true;
    $('#write-grade').hidden = false;
    $('#write-hint').textContent = '对照答案，给自己评一下';
    speak($('#write-answer-word').textContent);
  }

  function setupWritingInput() {
    const canvas = $('#write-canvas');
    let queued = false;
    const queueRedraw = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        redrawWriting();
      });
    };
    const pointAt = e => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
        p: e.pressure > 0 ? e.pressure : .5,
      };
    };

    canvas.addEventListener('pointerdown', e => {
      if (!reviewSession || reviewSession.mode !== 'write' || writing.revealed) return;
      if (e.pointerType === 'touch' && (writing.penUsed || e.width > 26)) return;
      if (e.pointerType === 'pen') {
        writing.penUsed = true;
        $('#write-hint').textContent = '手写笔已就绪 · 手掌会自动忽略';
      }
      e.preventDefault();
      writing.activeId = e.pointerId;
      writing.current = { tool: writing.tool, points: [pointAt(e)] };
      writing.strokes.push(writing.current);
      updateWritingPlaceholder();
      try { canvas.setPointerCapture(e.pointerId); } catch {}
      queueRedraw();
    });

    canvas.addEventListener('pointermove', e => {
      if (!writing.current || writing.activeId !== e.pointerId || writing.revealed) return;
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const point = pointAt(e);
      const last = writing.current.points.at(-1);
      if (Math.hypot((point.x - last.x) * rect.width, (point.y - last.y) * rect.height) < .7) return;
      writing.current.points.push(point);
      queueRedraw();
    });

    const endStroke = e => {
      if (writing.activeId !== e.pointerId) return;
      writing.current = null;
      writing.activeId = null;
    };
    canvas.addEventListener('pointerup', endStroke);
    canvas.addEventListener('pointercancel', endStroke);
    canvas.addEventListener('lostpointercapture', endStroke);
  }

  function rateWord(rate) {
    const s = reviewSession;
    if (!s || s.locked) return;
    s.locked = true;
    const w = s.queue[s.idx];
    const now = Date.now();
    w.reviews = (w.reviews || 0) + 1;
    if (rate === 'again') {
      w.interval = 0;
      w.due = now + 10 * 60000;
      w.status = 'learning';
      w.ease = Math.max(1.7, (w.ease || 2.5) - .2);
    } else if (rate === 'hard') {
      w.interval = Math.max(1, Math.round((w.interval || 0) * .6) || 1);
      w.due = now + DAY;
      w.status = 'learning';
      w.ease = Math.max(1.7, (w.ease || 2.5) - .05);
    } else {
      w.interval = w.interval < 1 ? 1 : Math.min(180, Math.round(w.interval * (w.ease || 2.5)));
      w.due = now + w.interval * DAY;
      w.correct = (w.correct || 0) + 1;
      w.status = w.interval >= 14 ? 'mastered' : 'learning';
      w.ease = Math.min(3.2, (w.ease || 2.5) + .05);
    }
    if (rate !== 'again') w.lastReview = now;
    s.counts[rate] += 1;
    s.answered += 1;
    state.stats.totalReviews += 1;
    if (rate !== 'again') state.stats.correct += 1;
    state.stats.reviewedToday.count += 1;
    save();
    s.idx += 1;
    $('#flashcard').classList.remove('flipped');
    setTimeout(() => {
      s.locked = false;
      renderReviewCard();
    }, 180);
  }

  function finishReview() {
    const s = reviewSession;
    if (!s) return;
    markStudied();
    renderAll();
    $('#review-body').hidden = true;
    $('#review-done').hidden = false;
    $('#review-progress-bar').style.width = '100%';
    $('#review-counter').textContent = `${s.queue.length} / ${s.queue.length}`;
    $('#done-good').textContent = s.counts.good;
    $('#done-hard').textContent = s.counts.hard;
    $('#done-again').textContent = s.counts.again;
    $('#done-sub').textContent = `你复习了 ${s.answered} 个单词，${s.counts.good} 个已经记住了。`;
  }

  function closeReview() {
    if (reviewSession && reviewSession.answered > 0) markStudied();
    reviewSession = null;
    $('#review-overlay').hidden = true;
    document.body.style.overflow = '';
    renderAll();
    nav('today');
  }

  /* ---------------- events ---------------- */

  $$('[data-go]').forEach(el => el.addEventListener('click', () => nav(el.dataset.go)));
  $('#btn-settings').addEventListener('click', openSettings);
  $$('.rail-settings').forEach(b => b.addEventListener('click', openSettings));
  $('#btn-review').addEventListener('click', () => startReview(reviewLayout));
  $$('.layout-chip').forEach(chip => chip.addEventListener('click', () => {
    reviewLayout = chip.dataset.layout;
    renderToday();
  }));
  $('#btn-quick-capture').addEventListener('click', () => nav('capture'));
  $('#btn-promo-capture').addEventListener('click', () => nav('capture'));
  $('#btn-add-word').addEventListener('click', () => openAddSheet());
  $('#btn-batch-mode').addEventListener('click', () => setBatchMode(!batchMode));
  $('#note-input').addEventListener('input', handleNoteInput);
  $('#btn-new-note').addEventListener('click', createNote);
  $('#btn-note-history').addEventListener('click', openNoteHistory);
  $('#btn-note-collect').addEventListener('click', collectPendingNoteWords);
  $('#btn-manual-from-capture').addEventListener('click', () => openAddSheet());
  $('#btn-sample').addEventListener('click', async () => {
    try {
      const res = await fetch('sample-page.jpg');
      const blob = await res.blob();
      await handlePhoto(new File([blob], 'sample-page.jpg', { type: 'image/jpeg' }));
    } catch {
      toast('示例照片载入失败');
    }
  });
  $('#btn-close-review').addEventListener('click', closeReview);
  $('#btn-done-review').addEventListener('click', closeReview);
  $('#btn-reset-photo').addEventListener('click', resetCapture);
  $('#flashcard').addEventListener('click', flipCard);
  $('#btn-flash-sound').addEventListener('click', e => { e.stopPropagation(); speak($('#flash-word').textContent); });
  $('#btn-flash-sound-back').addEventListener('click', e => { e.stopPropagation(); speak($('#flash-word-back').textContent); });
  $('#btn-flash-extra').addEventListener('click', e => {
    e.stopPropagation();
    const w = activeWord();
    if (w) openDetail(w.id);
  });
  $$('.rate').forEach(b => b.addEventListener('click', () => rateWord(b.dataset.rate)));
  $$('#review-modes [data-mode]').forEach(b => b.addEventListener('click', () => setReviewMode(b.dataset.mode)));
  $('#spell-check').addEventListener('click', checkSpelling);
  $('#spell-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      checkSpelling();
    }
  });
  $('#spell-retry').addEventListener('click', retrySpelling);
  $('#spell-hint-btn').addEventListener('click', spellHint);
  $('#spell-next').addEventListener('click', () => rateWord(spellState.rating));
  $('#spell-sound').addEventListener('click', () => speak(activeWord()?.word || ''));
  $('#write-sound').addEventListener('click', () => speak(activeWord()?.word || ''));
  $('#write-reveal').addEventListener('click', revealWriting);
  $('#write-right').addEventListener('click', () => rateWord('good'));
  $('#write-wrong').addEventListener('click', () => rateWord('again'));
  $('#write-undo').addEventListener('click', undoWriting);
  $('#write-clear').addEventListener('click', clearWriting);
  $$('.writing-tool').forEach(b => b.addEventListener('click', () => {
    writing.tool = b.dataset.tool;
    $$('.writing-tool').forEach(x => x.classList.toggle('is-active', x === b));
  }));
  setupWritingInput();
  $('#file-camera').addEventListener('change', e => handlePhoto(e.target.files[0]));
  $('#file-gallery').addEventListener('change', e => handlePhoto(e.target.files[0]));
  $('#file-document').addEventListener('change', e => handleFile(e.target.files[0]));
  $('#btn-change-file').addEventListener('click', resetCapture);
  $('#btn-clipboard').addEventListener('click', importFromClipboard);
  const captureCard = $('#capture-card');
  captureCard.addEventListener('dragover', e => {
    e.preventDefault();
    captureCard.classList.add('drag-over');
  });
  captureCard.addEventListener('dragleave', () => captureCard.classList.remove('drag-over'));
  captureCard.addEventListener('drop', e => {
    e.preventDefault();
    captureCard.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });
  $('#btn-select-all').addEventListener('click', () => {
    const selectable = visibleOcrResults().filter(r => !r.existing);
    const allSelected = selectable.length > 0 && selectable.every(r => live.selected.has(r.key));
    live.selected.clear();
    if (!allSelected) selectable.forEach(r => live.selected.add(r.key));
    renderOcrList();
    renderAddBar();
  });
  $('#btn-ocr-filter').addEventListener('click', () => {
    live.rareOnly = !live.rareOnly;
    $('#btn-ocr-filter').classList.toggle('is-on', live.rareOnly);
    updateOcrHead();
    renderOcrList();
  });
  $('#sheet-backdrop').addEventListener('click', e => { if (e.target === e.currentTarget) closeSheet(); });
  $('#search-input').addEventListener('input', e => {
    searchQuery = e.target.value;
    if (batchMode) batchSelected.clear();
    $('#search-clear').hidden = !searchQuery;
    renderLibrary();
  });
  $('#search-clear').addEventListener('click', () => {
    searchQuery = '';
    if (batchMode) batchSelected.clear();
    $('#search-input').value = '';
    $('#search-clear').hidden = true;
    renderLibrary();
  });
  $$('#filter-row .chip').forEach(chip => chip.addEventListener('click', () => {
    libraryFilter = chip.dataset.filter;
    if (batchMode) batchSelected.clear();
    $$('#filter-row .chip').forEach(c => c.classList.toggle('is-active', c === chip));
    renderLibrary();
  }));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!$('#sheet-backdrop').hidden) closeSheet();
      else if (!$('#review-overlay').hidden) closeReview();
    }
    if (e.key === ' ' && !$('#review-overlay').hidden && reviewSession?.mode === 'recall' && !reviewSession?.flipped) {
      e.preventDefault();
      flipCard();
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !$('#write-panel').hidden) {
      e.preventDefault();
      undoWriting();
    }
  });

  window.addEventListener('resize', () => {
    if (!$('#write-panel').hidden) resizeCanvas();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flushNoteSave();
    else syncShareInbox();
  });
  window.addEventListener('beforeunload', flushNoteSave);
  setInterval(() => {
    if (!document.hidden) syncShareInbox();
  }, 20000);

  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredInstall = e;
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  renderAll();
  loadDictionary();
  loadExtras();
  checkShareApi();
  setTimeout(syncShareInbox, 1200);

  window.__shici = {
    state,
    dict,
    addWord,
    addWords: (list) => list.forEach(x => addWord(x.word, x.trans, x.phone, 'manual')),
    nav,
    startReview,
    rateWord,
    renderAll,
    live,
    extractWords,
    review: () => reviewSession,
    setReviewMode,
    writing,
    spellState,
    setBatchMode,
    batchSelected,
    toggleAllVisible,
    syncShareInbox,
  };

  window.__shiciBack = () => {
    if (!$('#sheet-backdrop').hidden) {
      closeSheet();
      return true;
    }
    if (!$('#review-overlay').hidden) {
      closeReview();
      return true;
    }
    if (activeScreen !== 'today') {
      nav('today');
      return true;
    }
    return false;
  };
})();
