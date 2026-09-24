# 更新日志 / Changelog

本文件记录用户可感知的变化。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [0.3.0] — 2026-09-23

### 修复

- **用户配置在改名后静默丢失（P0）**。落点原先由 Electron 自动推导成
  `<appData>/<应用名>`，而应用名在开发态取 `package.json` 的 `name`、在打包态取 `productName` ——
  于是开发态落在 `%APPDATA%\dsh-multi-instance\`、打包版落在 `%APPDATA%\DSH Multi-Instance\`，
  而这个项目改过三次名字，每改一次旧目录里的 `config.json`（实例列表 + 窗格排布）与
  `Partitions/`（持久化的登录态）就留在原地没人认领。
  实测现场：`%APPDATA%\dsh-shell\config.json` 里有 1 个窗格和 14MB 的 `Partitions`，
  而当时的落点目录里只剩一个 `ui` 键。
- npm 入口在「Electron 模块装了、但二进制文件缺失」时会返回一个不存在的路径，
  表现为一句看不懂的 `spawn ENOENT`。现在会区分「没装」与「装了但缺二进制」，各给对应修法。

### 新增

- `src/main/appdata.js`：**把用户数据落点钉死**，并在启动时做一次旧目录迁移 ——
  只在当前目录没有窗格时才动手，取窗格里最多的那一份 `config.json`，
  连带 `Partitions/` 一起接过来，然后写一行日志说明迁移了什么、从哪来。
  幂等，跑过一次之后不会再动。纯逻辑、不依赖 Electron，可直接单测。
- `tests/run.js` + `npm test`：**可无头运行的测试套件**（零依赖、纯 Node，36 条）。
  覆盖落点解析、迁移的全部分支（含幂等、坏配置、不覆盖已有会话、失败不抛）、
  实例地址解析、npm 入口的运行时查找。
  原先仓库里只有 `--selftest*` 那几个开关，而它们全都要起真窗口 —— 没有图形界面的环境里一条都跑不了，
  上面那个配置丢失的缺陷就是这么漏过去的。
- `.github/workflows/ci.yml`：push / PR 时在 Windows 与 Linux 上跑 `npm test`（无需安装依赖）。
- `.github/` 社区健康文件：issue 表单（bug / 功能建议）、PR 模板、`SECURITY.md`、`CONTRIBUTING.md`。

### 文档

- 修正 README 里一条**实测为假**的说法：「构建路径不要含中文」。
  electron-builder 26.15.3 在含中文的路径下能正常打包，本仓库的开发目录就含中文，两种产物都是在原地打出来的。
- README 中英双侧补齐：目录导航、`npm test` 一节、关于落点钉死与自动迁移的说明、
  「升级后实例列表空了」的排障条目、相关项目互链、目录结构里的 `appdata.js` / `tests/`。
- 新增本文件。

### 变更

- 版本号 0.2.0 → 0.3.0。

## [0.2.0] — 2026-09-23

首个可发布版本。

### 新增

- 多实例桌面客户端：把 `dsh web` 的页面装进独立窗格，支持本机 / WSL2 / 远程三种目标。
- 每个窗格独立 `partition`（`persist:pane-<id>`），登录 cookie 互不覆盖。
- 拖动 / 缩放 / 吸附 / 分区（1/2、1/3、1/4）布局引擎，坐标为归一化 0..1，窗口缩放自动适配，退出持久化。
- 实例不允许重叠：拖动用最小平移向量推出，缩放遇到邻居就停。
- 自动发现：扫进程与端口段 + 扫 `dsh` 可执行文件与 npm 全局目录 + 扫常见同名目录（实测 5441 个目录约 300ms）；
  刻意不扫全盘。
- 内置安装器：界面上选版本 / npm 源 / 端口，执行 `npm install @deepseek-ai/dsh`，实测 565 个包约 4 分钟。
- 隐藏抽屉（上侧工具栏 / 左侧实例栏）、浅色与深色主题、中英双语。
- electron-builder 打包链：NSIS 安装包 + 免安装 zip。

### 已知限制

- 每个窗格约 241MB 内存（实测 12 个窗格 = 17 个进程 / 2897MB）。
- 仅 Windows；窗口行为（无边框、边缘热区）是照 Windows 调的，其他平台未验证。

## [0.0.1] — 2026-09-23

- **占位版本**，内容为空壳。仅用于占住 npm 上的包名，请以 GitHub 仓库为准。

[未发布]: https://github.com/BOWLUNA/dsh-multi-instance/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/BOWLUNA/dsh-multi-instance/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/BOWLUNA/dsh-multi-instance/releases/tag/v0.2.0
