# 拾词 · GitHub Pages 版

## 上传到 GitHub Pages

1. 在 GitHub 新建一个 public 仓库，例如 `shici`。
2. 打开仓库的 **Add file → Upload files**，把本文件夹里的所有内容拖进去（保留 `vendor/`、`vendor/core/`、`vendor/pdf/`、`vendor/lang/` 这些子目录），提交。
3. 进入 **Settings → Pages**，Source 选 **Deploy from a branch**，分支选 `main`，目录选 `/(root)`，保存。
4. 等 1–2 分钟，访问：
   `https://你的用户名.github.io/shici/`
5. 在 iPad Safari 中打开，点分享 → **添加到主屏幕**。
6. 第一次打开后，进入 **设置 → 离线准备 → 准备**。等它完成后，即使 GitHub 偶尔打不开，已缓存的应用、词库、笔记和 OCR 模型仍可离线使用。

## 重要说明

- 这是静态网页版，电脑关掉也能用：笔记、复习、拍照/文件识别、例句、派生词都正常。
- **分享收词**需要 `/api/inbox` 后端，GitHub Pages 不能运行它；设置里的分享收词会提示需要后端。真正的原生 Share Extension 需要 Mac + Xcode。
- 换网址后，iPad 的本地词库不会自动迁移。先在旧地址的设置 → 备份与迁移 → 导出，复制 JSON；再到新地址 → 导入。
- 例句数据来自 Tatoeba（CC BY 2.0 FR）与基础词库。
