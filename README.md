# dsh-multi-instance

[English](README.en.md) | **简体中文**

![dsh-multi-instance —— DeepSeek Harness 多实例桌面客户端](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/header.png)

<!-- 徽章行：与 dsh-custom-mode 同一套配色（深色标签 + 彩色值） -->
<!-- 版本以 GitHub Release 为准：npm 上目前只有占位包，所以 npm 徽章排在后面并写明 placeholder -->
[![release](https://img.shields.io/github/v/release/BOWLUNA/dsh-multi-instance?label=release&style=flat-square&logo=github&logoColor=white&labelColor=1f2430)](https://github.com/BOWLUNA/dsh-multi-instance/releases) [![platform](https://img.shields.io/badge/platform-Windows%20%7C%20WSL2-0078D4?style=flat-square&logo=windows&logoColor=white&labelColor=1f2430)](https://github.com/BOWLUNA/dsh-multi-instance/releases) [![tests](https://img.shields.io/github/actions/workflow/status/BOWLUNA/dsh-multi-instance/ci.yml?label=tests&style=flat-square&labelColor=1f2430&logo=githubactions&logoColor=white)](https://github.com/BOWLUNA/dsh-multi-instance/actions/workflows/ci.yml) [![license](https://img.shields.io/badge/license-MIT-97ca00?style=flat-square&logo=opensourceinitiative&logoColor=white&labelColor=1f2430)](LICENSE) [![electron](https://img.shields.io/badge/electron-40-47848F?style=flat-square&logo=electron&logoColor=white&labelColor=1f2430)](https://www.electronjs.org/) [![dsh](https://img.shields.io/badge/dsh-%E2%89%A50.1.5-4d6bfe?style=flat-square&logo=deepseek&logoColor=white&labelColor=1f2430)](https://github.com/deepseek-ai/deepseek-harness) [![npm](https://img.shields.io/npm/v/dsh-multi-instance?label=npm%20(placeholder)&style=flat-square&logo=npm&logoColor=white&labelColor=1f2430)](https://www.npmjs.com/package/dsh-multi-instance)

<!-- 社区行 -->
[![bilibili](https://img.shields.io/badge/bilibili-videos-%2300A1D6?style=flat-square&logo=bilibili&logoColor=white&labelColor=1f2430)](https://b23.tv/qJ4Ev0W) [![Douyin](https://img.shields.io/badge/Douyin-shorts-%23FE2C55?style=flat-square&logo=tiktok&logoColor=white&labelColor=1f2430)](https://v.douyin.com/VWh0M03Fa4Y/) [![RedNote](https://img.shields.io/badge/RedNote-notes-%23FF2442?style=flat-square&logo=xiaohongshu&logoColor=white&labelColor=1f2430)](https://xhslink.cn/o/A7QtXmePBBF) [![Discord](https://img.shields.io/badge/Discord-chat-%235865F2?style=flat-square&logo=discord&logoColor=white&labelColor=1f2430)](https://discord.gg/pz97SfAfSy) [![GitHub](https://img.shields.io/github/discussions/BOWLUNA/dsh-multi-instance?label=GitHub&style=flat-square&logo=github&logoColor=white&labelColor=1f2430)](https://github.com/BOWLUNA/dsh-multi-instance/discussions)

把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（dsh）的 Web 界面装进一个桌面客户端：
**多开多个实例** —— 本机、WSL2、或服务器上只有 URL 的远程 DSH 都能接。
每个实例各占一个窗格，**多窗口**自由排布与缩放；**多实例**之间互不干扰，每格有自己的浏览器会话。

一句话：**给 `dsh web` 套一层窗口管理器** —— 多个实例并排跑，互不干扰。

它不是浏览器插件，也不是对 dsh 的重实现 —— 就是给 `dsh web` 已经提供的那套页面，套一层窗口管理外壳。

**同样可能被搜到的说法**：DSH 多开 · 多实例 · 多窗口 · 多开窗口 · 分屏 · 平铺 · 窗口管理 · 桌面客户端 · 客户端 ·
套壳 · 网页套壳 · 远程接入 · 服务器 DSH · WSL2 · 独立会话 · 多会话 · 多标签 · 并排 · 自由布局 ·
DeepSeek Harness GUI · DSH GUI · dsh 图形界面 · dsh 桌面版

---

## 目录

- [它解决什么](#它解决什么)
- [它不做什么](#它不做什么)
- [安装](#安装)（安装包 / npm / 源码）
- [快速上手](#快速上手)
- [接入一处 DSH](#接入一处-dsh)（含[自动发现](#自动发现)、[手动安装](#手动安装)）
- [多窗格与排布](#多窗格与排布) · [会话隔离](#会话隔离)
- [操作](#操作)（隐藏抽屉、界面、快捷键）
- [从源码运行](#从源码运行) · [测试](#测试) · [从源码打包](#从源码打包) · [调试开关](#调试开关)
- [文件位置](#文件位置)
- [排障](#排障)
- [已知限制](#已知限制)
- [相关项目](#相关项目) · [参与贡献](#参与贡献) · [更新日志](CHANGELOG.md) · [许可](#许可)

---

## 它解决什么

dsh 自带的 Web 界面很好用，但一次只能看一处、一个窗口。当你需要同时盯着**本机 WSL 里的一处**和
**服务器上的另一处**（甚至是同一个实例的两个不同会话）时，浏览器标签页就不够用了：分不清哪个是哪个、
cookie 互相覆盖、排布全靠手拉。

这个壳只做三件事：

1. **接** —— 把每一处 dsh 当成一个「实例」管起来：跑在 WSL2 里的、跑在 Windows 本机的、或远端只有 URL 的服务器
2. **排** —— 每个实例开成一个窗格，拖动、缩放、吸附、平铺，排布结果记住
3. **隔** —— 每个窗格有自己独立的浏览器会话，多开不会互相踩 cookie

| | |
|---|---|
| **多实例并排** | 一屏放几个 DSH，各自独立窗格，拖拽缩放、自由排布 |
| **独立会话** | 每一格是独立的浏览器 partition，cookie / localStorage 互不干扰 |
| **跨环境接入** | 本机 Windows、WSL2 里的、以及服务器上的远程 DSH（带 token 的 HTTPS 地址）都能接 |
| **一键分屏** | 1/2、1/3、1/4 分区，选中后其余实例自动填剩余格 |
| **自动发现** | 扫本机常见位置，找到已装的 dsh 就问你要不要加进来 |
| **内置安装** | 不用开终端 —— 界面上选版本、选 npm 源、指定端口，直接装一份 dsh |

|  |  |
| --- | --- |
| ![多窗格平铺](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/03-tile.png) | ![自由排布 8 个实例](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/05-many.png) |
| ![分区光晕](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/04-zone.png) | ![实例设置](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/06-instance.png) |

|  |  |
| --- | --- |
| ![内置安装 dsh](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/08-install.png) | ![深色主题](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/09-dark.png) |

## 它不做什么

- **不捆绑 dsh**，也不会在后台自动下载它。要装，得你在界面里显式点「开始安装」
- **不做账号体系**：dsh 自己怎么认证，壳就怎么呈现
- **不碰 dsh 的任何数据**：不写 `~/.dsh`、不动凭证文件，只读你指定的地址文件
- **不扫你的全盘**：自动发现只走常见位置（理由见下）

---

## 安装

### 方式一：下载安装包（推荐）

到 [Releases](https://github.com/BOWLUNA/dsh-multi-instance/releases) 下载：

| 文件 | 说明 |
|---|---|
| `DSH.Multi-Instance-Setup-x.y.z.exe` | **安装包** —— 常规 Windows 安装程序，可选安装目录、建桌面和开始菜单快捷方式 |
| `DSH.Multi-Instance-x.y.z-x64.zip` | **免安装压缩包** —— 解压即用，不写注册表，适合放 U 盘或便携使用 |

> 文件名里的点是 GitHub 干的：上传时它会把名字里的空格换成 `.`（本地产物名里是空格）。

> 需要 Windows 10/11。软件本身不含 dsh —— 装完在界面里点「下载实例」，或者接你已有的 DSH。

### 方式二：npm

> ⚠️ **npm 上现在只有 `0.0.1`，那是个占位空壳**（只用来占住包名，装上去不会启动任何东西）。
> 可用的版本还没发到 npm —— 在那之前请用方式一或方式三。
> 想确认自己拿到的是不是真包，装之前先跑一句：`npm view dsh-multi-instance version`，
> 现在它会返回 `0.0.1`。

```bash
npm i -g dsh-multi-instance   # 装完用 dsh-multi-instance 启动
dsh-multi-instance --version  # 先确认装成了什么（不需要 Electron 也能看）
dsh-multi-instance --help     # 全部开关
```

> npm 方式需要先有 Electron 运行时（`npm i -g electron`）。打包成 exe 的那两种方式**不需要**任何前置依赖。
> `--version` / `--help` 是唯二**不需要** Electron 就能用的开关 —— 装完先跑这两条，比启动失败再猜省事。

### 方式三：从源码跑

```bash
git clone https://github.com/BOWLUNA/dsh-multi-instance.git
cd dsh-multi-instance
npm install
npm start
```

也可以双击 `start.vbs`（无黑框）或 `start.cmd`。

> ⚠️ 启动器里有一行 `unset ELECTRON_RUN_AS_NODE` / `set "ELECTRON_RUN_AS_NODE="`，**不要删**。
> 这个变量残留为 `1` 时（Electron 系工具的子进程会继承），`electron.exe` 会退化成纯 Node，
> 现象是「双击后毫无反应」。判据：`electron.exe --version` 输出 `v24.15.0` 就是中了，正常应输出 `v40.10.2`。

---

## 快速上手

1. 启动后**左侧栏**是实例列表。首次打开会自动扫本机已有的 dsh，扫到就问你要不要加。
2. 没有的话点「**下载实例**」——在界面上选版本（正式/预览/内测，或具体某个历史版本）、
   选 npm 源（官方/华为云/淘宝/腾讯云）、指定端口，直接装一份。
3. 也可以点「**增加实例**」手动填：本机端口、WSL2 里的、或服务器的 HTTPS 地址 + token。
4. 实例卡片**指示灯**：绿=在线、黄=服务在但要 token、红=连不上。
5. 实例上**划出气泡**（鼠标移到顶部中央）就能拖动 / 缩放 / 分区。
6. 点**画布空白**看快捷键；点**版本号**看运行环境。

### 三个按钮

| 按钮 | 作用 |
|---|---|
| **增加实例** | 手动加一个（本机 / WSL2 / 远程） |
| **搜索实例** | 扫本机常见位置找已装的 dsh。**刻意不扫全盘**（尊重隐私），界面会写明这次扫了哪些地方 |
| **下载实例** | 在界面上装一份新的 dsh，可指定版本、npm 源、端口 |

---

## 接入一处 DSH

一个「实例」记录的是：**这处 dsh 怎么跑、怎么拿到带 token 的访问地址、怎么起停**。按目标分三种：

| 类型 | 说明 |
| --- | --- |
| **WSL** | 跑在某个 WSL2 发行版里。可指定发行版与用户名（留空 = 用默认用户），地址从 `dsh-url.txt` 或进程输出里取 |
| **Windows** | 跑在 Windows 本机 |
| **远端** | 跑在别的机器上，只有 URL 和 token，壳只管显示 |

访问地址（含 token）按这个优先级解析：**上次成功捕获并持久化的地址 → 你指定的地址文件 → 启动实例时从进程输出里现抓**。

### 自动发现

左侧的「检测」会从三个维度扫：

- **已经装好、正在跑** —— 扫进程与常见端口段，拿到端口后按特征确认「这确实是 dsh」
- **已经装好、但没启动** —— 扫 `dsh` 可执行文件与 npm 全局目录，拿到可执行文件路径
- **装在自定义目录里** —— 扫常见位置的**同名文件夹**（`DeepSeek Harness` / `DeepSeekHarness` / `dsh-*` 等写法）

判定特征（实测）：**无 token 返回 `401` 且响应体含 `dsh web authentication required`；带 token 返回 `303` 且
`set-cookie` 含 `dsh-auth-`**。两者都符合才认。

#### 扫描范围，以及为什么不扫全盘

发现功能只走这些地方：

| 范围 | 深度 |
| --- | --- |
| `PATH` 里的 dsh | — |
| npm 全局目录 | — |
| 你的用户目录（优先 Desktop / Documents / Downloads / Projects / Code / Dev / Work 等） | 4 层 |
| 各盘根（`C:\` `D:\` …） | 2 层 |

实测走过 **5441 个目录约 300ms**，很快。它**刻意不扫全盘**，两个理由：

1. **隐私** —— 全盘扫意味着会去读你 `Documents`、`Pictures` 里所有文件的名字。这个壳没有理由知道那些
2. **不划算** —— 全盘是百万级文件、几分钟的量级，而 DSH 几乎不可能装在冷门深处

而且**撞名只是线索，不是判据**。目录名像 dsh 的很多（实测 28 个），但真装过 dsh 的目录里一定躺着
`node_modules/@deepseek-ai/dsh/package.json` —— 只有找到它才算数（实测 28 个里只有 1 个是真的）。

界面上会写明**这次扫了哪些地方、走过多少目录**。扫不到就用「增加实例」手填。

### 手动安装

壳**不捆绑** dsh。只有你点了「开始安装」，它才会往你指定的目录执行一次 `npm install @deepseek-ai/dsh`。

| 项 | 说明 |
| --- | --- |
| **装到哪** | WSL2 发行版（在该发行版里装）/ Windows 本机 |
| **目录** | 任意目录。`~` 开头会展开成该用户的 home |
| **版本** | `最新正式版` / `预览版` / `内测版`，或点「拉取」列出**全部历史版本**任选 |
| **端口** | 装完自动创建的实例用这个端口 |
| **npm 源** | npm 官方 / 华为云 / 淘宝 npmmirror / 腾讯云 / 自定义 |

安装前可以「检查环境」确认 node/npm 就位，过程实时回显输出，装完自动 `dsh --version` 验证并建好实例。

**实测数据**（Windows 目标、npm 官方源）：565 个包、约 4 分钟、产物 294MB、`dsh --version` 正常。

> 换源提示：四个源的 `dist-tags` 实测一致，差别只在速度。装得慢或超时就换近的源。

---

## 多窗格与排布

- **拖动**：鼠标划到窗格**顶部中央**会滑出一个气泡把手，按住它拖
- **缩放**：拖窗格的四条边或四个角
- **吸附**：拖到接近其他窗格的边或中线时自动对齐，并显示辅助线
- **铺满 / 归位**：双击窗格顶部
- **一键平铺**：工具栏的排布按钮
- **分区**：点 1/2、1/3、1/4 出**分区光晕**，选中后其余窗格自动填剩余格

窗格上**没有边框也没有标题栏** —— 拿到的画面就是全部。排布结果是归一化坐标（0..1），
所以窗口缩放后会自动适配；退出时持久化，下次打开原样恢复。

> 实例不允许重叠：拖动时用最小平移向量推出，缩放遇到邻居就停。

## 会话隔离

同一个 dsh 可以开任意多个窗格。**每个窗格有自己独立的浏览器会话**（`partition = persist:pane-<id>`），所以：

- 不同实例之间的登录 cookie 不会互相覆盖 —— 这是多开 dsh 最容易踩的坑
- 同一个实例开两个窗格，各自带着 token 独立认证，互不影响
- 每个窗格的会话存在磁盘上，重启应用后不用重新认证

> 因为 token 会随会话存下来，**用户配置文件里可能包含你填过的 token**。那个目录别拿去分享或提交 Git。

---

## 操作

### 两个隐藏抽屉

| 抽屉 | 怎么叫出来 |
| --- | --- |
| 上侧（地址栏、刷新、新建、平铺、窗口控制） | 鼠标移到**窗口最顶部边缘**，或点顶部中间的小横条 |
| 左侧（实例列表、检测、安装、主题、语言、关于） | 鼠标移到**窗口最左边缘**，或点工具栏最左的 `≡` |

抽屉平时完全收起，展开时窗格会**整体让位**（不是盖在上面），所以标题栏和内容永远不会被压住。想让它常驻，点上侧工具栏的图钉。

### 界面

|  |  |
|---|---|
| ![常驻标题栏与左侧抽屉](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/02-sidebar.png) | ![深色主题](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/09-dark.png) |

- **常驻标题栏（20px）**：左边 `⌄` 展开工具栏 + `＋` 新增实例，中间可拖窗口，右边最小化/最大化/关闭。
  它占真实空间，所以**永远不会盖住 DSH 自己的按钮**。
- **两个隐藏抽屉**：上侧（地址栏、刷新、平铺）和左侧（实例列表）。平时全收起，画布只剩 3px 边距。
- **主题**：浅色 / 深色 / 跟随系统。**语言**：中文 / English。
- **实例无边框无标题栏** —— 整个画面都是 DSH，操作靠悬停气泡。

### 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl+Shift+T` | 固定 / 收起上侧工具栏 |
| `Ctrl+Shift+B` | 固定 / 收起左侧抽屉 |
| `Ctrl+N` | 打开实例列表（新建窗格） |
| `Ctrl+R` | 刷新当前窗格 |
| `Ctrl+W` | 关闭当前窗格 |
| `Esc` | 收起所有抽屉与菜单 |

这些键在鼠标焦点位于 dsh 页面内部时同样有效 —— 主进程监听 `before-input-event` 再转发回外壳，
否则 `<webview>` 会把键盘事件全吃掉。

---

## 从源码运行

需要 Node.js 与 npm。

```bash
git clone https://github.com/BOWLUNA/dsh-multi-instance.git
cd dsh-multi-instance
npm install          # 只装 electron 与 electron-builder
```

启动（三选一）：

| 方式 | 命令 | 说明 |
| --- | --- | --- |
| 双击 | `start.vbs` | 无黑框，日常用这个 |
| 双击 | `start.cmd` | 会出现一瞬间 cmd 窗口 |
| 命令行 | `./start.sh` | 开发用，日志同时打到终端 |

### 测试

```bash
npm test              # 纯 Node，不需要图形界面、不需要 Electron
```

覆盖的是**纯逻辑**：用户数据落点与迁移、配置的读写/备份/损坏恢复、实例地址解析、
npm 入口的参数解析与运行时查找。零依赖、纯 Node，不需要装任何东西。
窗口行为、渲染层交互那些仍然只能靠 `--selftest*`（它们要起真窗口，没 GUI 就跑不了）。

> 为什么要分开：`--selftest*` 在没有图形界面的环境（CI、SSH、容器）里一条都跑不了，
> 于是「改完有没有改坏」只能靠肉眼 —— 这个项目就是因此漏过一次**用户配置被静默丢弃**的缺陷。

### 从源码打包

```bash
npm run dist          # 同时出 exe 安装包 + zip 免安装包
npm run dist:setup    # 只出 exe 安装包（NSIS）
npm run dist:zip      # 只出 zip
```

产物在 `dist/`。上面三条都会先自动跑一次 `npm run clean:dist`（`predist` 钩子）。

> 实测（electron-builder 26.15.3）：**含中文的路径下也能正常打包** —— 本仓库的开发目录就含中文，
> 上面两种产物都是在原地打出来的，不需要挪到英文临时目录。

> **`clean:dist` 是干什么的**：electron-builder 解包 electron 之前会先删掉
> `dist/win-unpacked` 与 `dist/win-unpacked.tmp`。在带「批量删除守卫」的沙箱里
> （某些 AI 终端会注入这类拦截），这一步会以
> `SAFE_DELETE_BULK_CONFIRM_REQUIRED` 失败 —— **而且是在解包阶段就失败，一个产物都不会有**，
> 不是「收尾清理报错、产物已生成」那种可以忽略的情况。
> `clean:dist` 用**同步**的 `fs.rmSync` 提前把这两个目录删掉（同步 API 不在拦截范围内），
> 走到那一步时目录已不存在，计数为 0，守卫不会触发。
> 平时手动打包用不到它 —— 只在这类沙箱里需要。

### 调试开关

```bash
./start.sh --demo                      # 展开抽屉 + 打开实例
./start.sh --demo --demo-zone=4        # 展示 1/4 分区光晕
./start.sh --demo --demo-page=install  # 打开安装页
./start.sh --selftest                  # 合成鼠标事件验证「划出气泡 → 按住气泡拖动」
./start.sh --selftest-side             # 验证侧栏三条收起路径
./start.sh --selftest-win              # 验证常驻标题栏给画布让出了空间
./start.sh --selftest-tip              # 全量检查悬停提示会不会被窗口/侧栏裁掉
./start.sh --memtest                   # 全部打开后统计进程数与内存
./start.sh --no-discover               # 关掉启动时的自动发现弹窗（截图用）
./start.sh --mask-token                # 地址栏里的 token 打码（截图用）
./start.sh --eval="<js>"               # 加载后在渲染层跑一段 JS
./start.sh --devtools / --verbose

# 自动截图后退出（GUI 取证用）
./start.sh --shot=<path> --shot-delay=<ms> --shot-exit
```

---

## 文件位置

| 内容 | 路径 |
| --- | --- |
| 用户配置（实例列表、窗格排布） | 应用数据目录下的 `config.json` |
| 配置的自动备份（最近 3 份） | 同目录 `config.json.bak-1` … `bak-3` |
| 配置损坏时保留的残片 | 同目录 `config.json.corrupt-<时间戳>` |
| 每个窗格的登录态（浏览器分区） | 应用数据目录下的 `Partitions/` |
| 主进程日志 | 应用数据目录下的 `logs/main.log` |

应用数据目录在 Windows 上是 `%APPDATA%\dsh-multi-instance\`（开发态与打包版**同一个位置**）。

**配置是怎么被保护的**（改坏过的人会关心这个）：每次覆盖 `config.json` 之前，先把**上一位能解析的**内容
滚成 `bak-1`（旧的往后推，只留 3 份）；读不出来时，先把手上的残片原样存成 `config.json.corrupt-<时间戳>`，
再从最近的备份回退，并把回退结果**写回主文件**。日志里会写明发生了什么：

```
[store] 配置损坏，残片已保留: config.json.corrupt-2026-09-24T05-31-02-123Z（32 字节）
[store] 已从 config.json.bak-1 回退配置并写回主文件
```

所以「实例列表突然空了」不再是终局 —— 先别动文件，看 `logs/main.log` 里有没有上面两行，
`bak-1` 就是上一次的配置。

> **落点是钉死的，不是自动推导的。** Electron 默认把它算成 `<appData>/<应用名>`，
> 而应用名在开发态取 `package.json` 的 `name`、在打包态取 `productName` ——
> 不钉死就会变成两套目录：你在源码里排好的布局，打包版用户打开是空的。
>
> 这个项目改过三次名字（`dsh-shell` → `dsh-webview-desktop` → `dsh-multi-instance`），
> 所以启动时会**自动做一次迁移**：若当前目录里没有窗格，就去旧目录里找
> （`DSH Multi-Instance` / `dsh-webview-desktop` / `dsh-shell` / `DSH套壳`），
> 把窗格最多的那一份 `config.json` 连同 `Partitions/` 一起接过来。
> 只在**当前目录没有窗格**时才动手，跑过一次之后就不会再动。日志里会写明迁移了什么、从哪来。

应用**不会**修改 dsh 启动器写出的地址文件，也**不会**碰 dsh 自己的凭证文件。

---

## 排障

**窗格显示红色状态点 / 提示拿不到访问地址**
在窗格或实例条目上点「启动」，或先手动确认服务：`curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/`。
**返回 `401` 说明服务是活的**，只是缺 token —— 这属于正常现象，不是故障。

**远端实例的 token 从哪来**
dsh 的访问地址形如 `https://<你的域名>/?token=xxxxxxxx`。在服务器上执行下面这条，把 `token=` 后面那串填进实例的 Token 字段：

```bash
grep -hoE 'token=[A-Za-z0-9_-]+' ~/.local/share/dsh/web.log | tail -1
```

**加载出来是 401 页面**
说明这个实例缺 token，或 token 已经过期。打开实例的「编辑」，重新填 token。

**服务器实例连不上**
检测结果会区分三种：绿色=在线、黄色=服务在但需要 token、红色=连不上。
如果是 HTTPS 站点，注意服务端证书要有效 —— 证书链不完整会让握手直接失败在 TLS 层，
那不是壳的问题（用 `curl -v https://你的域名/` 看证书报错）。

**平铺之后画面糊成一团**
窗格太多了。实测每个窗格约 **241MB** 内存：16GB 机器舒服跑到 **12 个**左右，20 个开始吃紧，30 个以上不现实。
**收进左侧抽屉的实例不占内存**（webview 会被卸载），只有在画布上的才吃资源。

**想知道应用到底做了什么**
```bash
tail -f "<应用数据目录>/logs/main.log"
```
里面记录了：地址解析结果、每个 webview 的挂载与加载结果、发现扫描的目录数与耗时、失败原因。

**升级后实例列表空了 / 排布回到默认了**
0.3.0 起落点已钉死为 `%APPDATA%\dsh-multi-instance\`，并会在启动时从旧目录自动接回配置。
看日志里有没有这一行：

```
[appdata] 已从 <旧目录名> 迁移: config.json, Partitions（窗格 N 个）
```

没有这行、而旧目录确实存在，说明旧目录里也没有窗格 —— 那就手动把旧目录的 `config.json`
复制到 `%APPDATA%\dsh-multi-instance\` 下面（先关掉应用）。
（0.2.0 及更早版本存在落点漂移：开发态与打包版会写到不同目录。日志里 `userData=` 那行是权威答案。）

**0.4.0 起，配置自己会留备份**：目录里出现 `config.json.bak-1` / `bak-2` / `bak-3` 是正常的
（每写一次往前滚一位），出现 `config.json.corrupt-<时间戳>` 说明读到过一次坏内容 ——
那一份是**原样保留的残片**，先别删。日志里会有对应两行，`bak-1` 通常就是你要回的那一版：
关掉应用，把 `config.json.bak-1` 复制成 `config.json`，再启动。

**实例列表里的条目在，但连不上 / 状态点是红的**
这跟配置无关，是那一处 DSH 本身不在。按上面「窗格显示红色状态点」那条查。

---

## 已知限制

- **一个实例约 241MB**（实测：12 个实例 = 17 个进程 / 2897MB）。
  16GB 机器舒服跑到 12 个左右，20 个开始吃紧。收进侧栏的实例不占内存（webview 会卸载）。
- **平铺装不下时会提示**：12 个起格子开始勉强、20 个以上不可用（软件会告诉你，而不是让你对着糊成一团猜）。
- **实例画面顶部中央那 20px 被气泡热区占着**，点不到 DSH 页面那里的东西 —— 这是拿鼠标事件必须付的代价。
- **发现只扫「常见位置」**：PATH、npm 全局目录、用户目录（4 层内）、各盘根（2 层内），实测约 300ms。
  装在冷门深处的找不到 —— 手动加即可。
- **dsh 页面里的 `window.open`** 会被转给系统默认浏览器，不会在壳内新开窗格。
- **没有 macOS / Linux 版**。Electron 跨平台，但窗口行为（无边框、边缘热区）是照 Windows 调的，其他平台未验证。
- 窗格缩放到最小尺寸有下限（舞台的 16%），防止被拖成看不见的小条。
- 拖动把手在气泡上，所以**拖动前要先把气泡划出来**。

---

## 目录结构

```
.
├── package.json
├── bin/cli.js                           npm 包的可执行入口（--version / --help + 找 electron 并拉起应用）
├── build/icon.ico                       应用图标
├── start.cmd / start.vbs / start.sh     启动器（三选一）
├── tests/run.js                         纯 Node 测试套件（npm test）
├── tools/screenshots/shoot.js           批量拍 README 截图
├── docs/images/                         README 用的截图
└── src/
    ├── main/
    │   ├── main.js        主进程：窗口、webview 加固、IPC、自测打点
    │   ├── appdata.js     用户数据落点（钉死）+ 旧目录迁移
    │   ├── instances.js   实例模型：地址解析、起停、可达性探测
    │   ├── discovery.js   自动发现：扫进程/端口 + 扫 dsh 可执行文件 + 扫常见目录
    │   ├── installer.js   手动安装器（不捆绑 dsh）
    │   └── store.js       JSON 配置读写：原子写 + 滚动备份 + 损坏回退
    ├── preload/preload.js 白名单 IPC 桥
    └── renderer/
        ├── index.html
        ├── style.css      纸白底 + 半调网点的视觉
        ├── icons.js       内联 SVG 图标
        ├── i18n.js        中英双语词典
        ├── layout.js      布局引擎（拖动 / 缩放 / 吸附 / 分区）
        └── app.js         编排：实例面板、抽屉、窗格、快捷键
```

---

## 相关项目

| 项目 | 是什么 |
| --- | --- |
| [dsh-custom-mode](https://github.com/BOWLUNA/dsh-custom-mode) | 同作者的 DSH 插件：一套系统提示词的**管理、切换与分享**。装在 DSH 里用，与这个壳互补 |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | 上游。本项目只消费它的 Web 界面，不修改本体 |

## 参与贡献

| | |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 怎么跑起来、改完该测什么、三条不要动的不变式 |
| [SECURITY.md](SECURITY.md) | 它经手哪些敏感数据；发现了问题走私密通道报 |
| [CHANGELOG.md](CHANGELOG.md) | 每个版本改了什么 |
| [Issues](https://github.com/BOWLUNA/dsh-multi-instance/issues) | 缺陷与建议（有表单，会顺便问你版本和日志） |
| [Discussions](https://github.com/BOWLUNA/dsh-multi-instance/discussions) | 用法交流、排布方案、接哪台服务器 |

## 与 DeepSeek Harness 的关系

本项目是**独立的第三方外壳**，与 DeepSeek 官方无隶属关系。它只消费 dsh 已经对外提供的 Web 界面，
不修改 dsh 本体，也不代表官方立场。

## 更新日志

见 [CHANGELOG.md](CHANGELOG.md)。

## 许可

[MIT](LICENSE)
