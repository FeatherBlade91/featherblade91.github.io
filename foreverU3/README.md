# LYK ♥ DMY · 梦幻恋爱相册（foreverU3）

纯静态情侣电子相册，作为 `featherblade91.github.io` 主站的子页面部署在
**<https://featherblade91.github.io/foreverU3>**。
淡蓝 × 淡粉 × 泡泡的梦幻风格，无需任何后端。

## 功能

- 🏠 **首页**：恋爱计时器（从 2025-08-26 开始）、纪念日倒计时、悄悄话弹窗（打字机 + 花瓣动画）
- 🎡 **3D 旋转相册**：照片围成立体圆环无限滚动，横图横放、竖图竖放（保留真实宽高比，不裁剪），
  可拖拽旋转、上下调视角、带倒影
- 🌌 **星河漫游**：照片散落在 3D 隧道里，相机自动穿梭，拖拽环顾、滚轮加速；
  背景是一颗 WebGL 土星（粒子环按开普勒差速旋转，规格对齐 `saturn.html`）+ 星幕 + 流星雨
- 🎞 **全屏幻灯片**：无边框全屏自动播放，淡入淡出 + Ken Burns 缩放，显示照片名称，支持触屏滑动
- 🎵 **背景音乐**：右上角展开式播放器，可暂停、拖动进度及切换上一首/下一首，四首歌连续循环
- ⚙ **管理端**（`admin.html`）：
  - **本地导入**：把照片直接写进本地项目文件夹，JPG 自动读取 EXIF 拍摄日期
  - **在线上传**：输入 GitHub Token，浏览器里直接把新照片提交到仓库

> 📖 时间轴页面暂时下线（照片时间尚未标注），代码保留在 `js/main.js` 的
> `buildTimeline()` 与 `css/style.css` 的「时间轴」段，标注好日期后加回导航和
> `#page-timeline` 区块即可恢复。

## 本地预览 + 登记照片

```bash
# 在项目目录（index.html 所在处）运行：
python -m http.server 8000
```

1. 把照片直接拷进 `photos/` 文件夹（拷多少都行）。
2. 用 Chrome / Edge 打开 <http://localhost:8000/admin.html>。
3. 「本地相册」卡片 → 选择项目文件夹（弹授权，允许读写）→ 自动列出全部照片：
   - **待登记**：新发现的照片，JPG 自动填入 EXIF 拍摄日期（其他格式取文件修改时间）；
   - **已登记**：已在清单里的照片，可直接改日期和标题；
   - 日期、标题都可以留空，留空的词条在相册里不会显示；
   - 「不收录」可把某张照片排除出相册（文件保留），文件被删掉的条目保存时自动剔除。
4. 点「保存到 photos.json 🫧」，打开 <http://localhost:8000/> 刷新即可看到效果。

> 必须走 http:// 访问；直接双击 index.html 时浏览器会拦截 photos.json 的读取。
> 如果不用浏览器管理，也可以跑 `python tools/sync_photos.py` 一键同步清单（只读 EXIF 日期，不写文案）。
>
> 新增照片后记得跑 `python tools/make_thumbs.py` 生成 `thumbs/` 小图（长边 640px），
> 3D 相册和星河漫游用它加载，点开大图才读 `photos/` 原图；不跑也能看（会自动回退原图），只是慢。

## 部署到 featherblade91.github.io/foreverU3

项目里的 `.deploy/` 是主站仓库 `featherblade91.github.io` 的本地克隆，
相册部署在其中的 `foreverU3/` 子目录：

1. 把本项目文件（`index.html`、`admin.html`、`css/`、`js/`、`photos/`、`thumbs/`、`photos.json`）
   复制到 `.deploy/foreverU3/`。
2. 在 `.deploy/` 里 `git add -A && git commit && git push`。

> ⚠ 主站的 Hexo 部署会**强制覆盖整个仓库历史**（但 `foreverU3/` 内容会保留）。
> 如果 `git push` 被拒（non-fast-forward），说明 Hexo 刚部署过，在 `.deploy/` 里执行
> `git fetch origin && git reset --hard origin/master`，再重新复制本项 目文件、提交、推送即可。

等 1~2 分钟，访问 <https://featherblade91.github.io/foreverU3>。
（文件都在子目录里，不会影响主站首页。）

## 在线上传照片（管理端 GitHub 模式）

1. 在项目根目录运行 `python3 tools/local_server.py`，再打开
   <http://127.0.0.1:8000/admin.html>。管理端会自动读取本机 `gh` 登录凭据，
   不需要手动粘贴 Token（仓库/分支/子目录已在 `js/config.js` 里预填）。
2. 页面会自动连接并读取线上相册；选照片（支持批量）、填日期文案后点「提交到 GitHub 💌」即可。
   GitHub Pages 约 1~2 分钟后更新线上相册。

### 线上照片的键盘编辑

连接仓库后，在「管理现有照片」的编辑工作台里可以连续处理照片：

- `F2` 聚焦当前照片的真实文件名；按 `Tab` 进入日期框，直接输入 8 位 `YYYYMMDD`；
- `←` / `→` 切换上一张 / 下一张照片，切换前会保留当前输入；
- `Delete` 将照片标记进回收站，`Ctrl+Z` / `⌘+Z` 可在保存前撤销；
- 日期框按 `Enter`、点击「保存」，或按 `Ctrl+S` / `⌘+S`，都会一次性同步文件名、日期和删除操作。

日期会在提交前校验为真实日期，并写回相册使用的 `YYYY-MM-DD` 格式。改名时原图和 `thumbs/` 缩略图会一起迁移；删除时两者会移动到仓库的 `trash/photos/` 与 `trash/thumbs/`，而不是永久删除。

> Token 由本机已登录的 `gh` CLI 临时提供，不写入项目文件，也不保存到浏览器。

## 个性化

所有需要你改的文字都在 `js/config.js` 里：

- `anniversaryDate`：在一起的日期（2025-08-26，计时器起点）
- `loveLetter`：悄悄话内容
- `milestones`：纪念日（已填：08-26 纪念日、01-19 她的生日、05-27 他的生日、05-20）
- `repo.pathPrefix`：仓库内子目录，改部署位置时才需要动

照片数据在 `photos.json`，由管理端自动维护，一般不需要手改。
