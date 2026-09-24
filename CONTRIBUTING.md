# 参与开发

## 这个项目要什么

一句话：**没有证据的结论等于没结论。**

不写「应该没问题」「理论上可以」。改完要说清楚**怎么验证的**，并把命令与原始输出贴出来。
这条规矩比任何代码风格都重要 —— 下面所有规则都是它的推论。

## 先把东西跑起来

```bash
git clone https://github.com/BOWLUNA/dsh-multi-instance.git
cd dsh-multi-instance
npm install          # 只装 electron 与 electron-builder
npm test             # 无头，不需要图形界面
npm start            # 起窗口（或者双击 start.vbs）
```

### 改完之后怎么测

| 你动了什么 | 该跑什么 |
| --- | --- |
| 纯逻辑（`appdata.js`、地址解析、CLI 入口） | `npm test` —— 新增逻辑请**顺手加一条断言**，套件就是为这个存在的 |
| 窗口行为、排布、抽屉、悬停气泡 | `./start.sh --selftest*`（**需要 GUI**）；`npm test` 覆盖不到 |
| 主进程的落点 / IPC / webview 加固 | 两边都要，另外在 PR 里说明**影响面** |

`npm test` 是零依赖的纯 Node（`tests/run.js`，退出码即结论）。
推之前请确认它在你机器上是全过的 —— CI 会在 Windows 与 Linux 上各跑一遍。

## 三条不要动的不变式

1. **启动器里的 `unset ELECTRON_RUN_AS_NODE` / `set "ELECTRON_RUN_AS_NODE="` 不要删。**
   这个变量残留为 `1` 时（Electron 系工具的子进程会继承），`electron.exe` 会退化成纯 Node、
   不起 Chromium，现象是「双击毫无反应」。判据：`electron.exe --version` 输出 `v24.x`（Node 版本）
   而不是 `v40.x`（Electron 版本）。
2. **每个窗格必须有自己的 `partition`**（`persist:pane-<id>`）。共享 session 会让多实例互相覆盖 cookie，
   这是多开 DSH 最容易踩的坑。
3. **窗格不允许重叠。** 拖动时用最小平移向量推出，缩放遇到邻居就停。这是明确的产品决定，不是实现细节。

## 用户数据落点别乱动

`app.setPath('userData', ...)` 在 `src/main/main.js` 里被**钉死**成了固定目录名，
并且在启动时做一次旧目录迁移。原因见 `src/main/appdata.js` 顶部的注释：

Electron 默认把落点算成 `<appData>/<应用名>`，而应用名在开发态取 `package.json` 的 `name`、
在打包态取 `productName`。**不钉死就会变成两套目录**，而且这个项目改过三次名字 ——
每改一次，老用户的实例列表、窗格排布和登录态就被留在原地。

所以：**不要**把落点改回自动推导，**不要**改 `APP_DIRNAME`（一改就等于换了个新落点）。
动这块逻辑必须同时改 `tests/run.js` 里对应的断言。

## 文档

- 用户可见行为有变化，**中英两份 README 都要改**（`README.md` / `README.en.md`），并加一条 `CHANGELOG.md`。
- README 里的截图在 `docs/images/`，用 `tools/screenshots/shoot.js` 拍。
  **写引用之前先 `ls` 确认真实文件名** —— 这个仓库曾经凭想象写过 7 个图片名，全部 404。
- 截图**不许带私人信息**：真实工作区名、真实会话标题、中转站域名、消费金额、**以及 token**。
  拍干净图用 `--demo-url=<干净的 DSH 地址>` + `--mask-token`。
- 仓库的**社交预览图**（GitHub 右上角卡片，1280×640）由 `python tools/social-preview.py` 生成，
  产物是 `docs/images/social-preview.png`。改了文案或主视觉之后重跑一次 ——
  但**上传只能手动**：仓库 Settings → Social preview → Upload an image（GitHub 没有公开 API，
  试过 `POST /repos/{owner}/{repo}/og-image` 一类的端点，全是 404）。

## 提交

- 提交信息用 `type: 说明`（`feat` / `fix` / `docs` / `test` / `chore`）。
- 一个提交一件事；「顺手改了别的地方」请在 PR 描述里点出来。
- 不许 `--force` 推 `main`。
