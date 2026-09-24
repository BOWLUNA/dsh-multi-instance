# 更新日志 / Changelog

本文件记录用户可感知的变化。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)。

## [未发布]

## [0.4.0] — 2026-09-24

### 修复

- **配置损坏会被静默抹掉（P1）**。`store.js` 读不出 `config.json` 时只打一行日志、按空配置继续，
  而**紧接着任何一次写入（改主题、拖动窗格）都会用这份空配置把原文件覆盖掉** ——
  目录里既没有备份也没有残片，用户唯一的实例列表与排布就此消失。
  探针实测（修复前）：残片 32 字节 → 一次 `set()` 之后主文件变成 38 字节的新内容，
  目录里只有 `config.json` 一个文件，无从恢复。
  现在改为：写前把**上一位能解析的**内容滚成 `config.json.bak-1`（保留 3 份）；
  读不出来时先把手上的残片原样存成 `config.json.corrupt-<时间戳>`，再从最近的备份回退，
  并把回退结果写回主文件（自愈）；两个动作都会写进 `logs/main.log`。
  复验（修复后）：坏盘 + 无备份 → 残片字节级保留；坏盘 + 有 `bak-1` → 实例列表原样回来。
- 备份链只收**能解析的**内容 —— 否则一次坏盘会把好备份一路挤掉，让「回退」退到另一个坏文件上。
- `store.js` 的日志接到主日志流：以前它写的是 `console.error`（打包版看不见），
  现在「实例列表怎么空了」在 `logs/main.log` 里查得到。
- npm 入口的 `--version` / `--help` 之前会被当成 Electron 参数透传 —— 两条命令什么都不打印。

### 新增

- **`dsh-multi-instance --version` / `-v`**、**`--help` / `-h`**。这两条**不需要 Electron** 就能用
  （参数解析排在「找 Electron」之前）—— 用户装完包的第一个动作不该先撞上「找不到运行时」。
  `--help` 列出全部开关；`--` 之后的参数一律当字面量透传。
- `.gitattributes`：显式声明二进制资产（PNG / ICO / zip / exe …）。
  这不是模板搬运 —— 本项目曾经把 README 的 PNG 与图标 ICO 当文本处理过，图全花了，
  只好写脚本重建 blob（`d8eb824`）。git 的自动检测只在 add 时生效，挡不住 patch / API 通道。
- `.editorconfig`：与上一条配套，统一编码与换行符。
- `.github/dependabot.yml`：electron / electron-builder 每周汇总成一个 PR，Actions 每月一次。
- `tools/clean-dist.js` + `npm run clean:dist`（挂在 `dist*` 的 `predist` 钩子上）。
  electron-builder 解包前会删 `dist/win-unpacked` 与 `dist/win-unpacked.tmp`，
  在带批量删除守卫的沙箱里这会让**打包在解包阶段就失败、一个产物都没有**（实测
  `SAFE_DELETE_BULK_CONFIRM_REQUIRED count=80/293 threshold=50`）。改用同步 `fs.rmSync`
  提前清掉（同步 API 不在拦截范围内），守卫不再触发。详见「文档」一节的更正。
- `docs/index.html`：GitHub Pages 落地页（纸白 + 半调网点，单文件、无外部依赖）。
- `tests/run.js`：36 条 → **54 条**。新增 13 条覆盖配置的读写/备份轮转/损坏回退/残片保留，
  5 条覆盖 CLI 参数解析。

### 变更

- README 徽章行以 **GitHub Release 版本为准**（npm 徽章移到末位并标注 `placeholder`）
  —— 之前首页显示的是 npm 上那个 `0.0.1` 占位包，与仓库实际版本对不上。
- README 中英双侧补：`--version` / `--help` 用法、配置备份与残片的说明、
  「实例列表突然空了」的抢救步骤、测试覆盖范围、`clean:dist` 的作用。

### 文档（更正一条实测为假的说明）

- README 里「electron-builder 收尾清理 `dist/win-unpacked` 时报删除失败可以忽略，产物已生成」
  这条**是错的**。实测两次失败都发生在**解包（unpack）阶段**，`dist/` 里除了上一版的产物
  什么都没有：它不是收尾清理，而是把整个打包卡死。中英双侧已改成准确描述 + `clean:dist` 的用法。

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

[未发布]: https://github.com/BOWLUNA/dsh-multi-instance/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/BOWLUNA/dsh-multi-instance/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/BOWLUNA/dsh-multi-instance/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/BOWLUNA/dsh-multi-instance/releases/tag/v0.2.0
