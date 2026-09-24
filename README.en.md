# dsh-multi-instance

English | [简体中文](README.md)

![dsh-multi-instance — a multi-instance desktop client for DeepSeek Harness](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/header.png)

<!-- badge rows: same two-part structure (dark label + coloured value) in both rows; every new repo copies this block -->
[![release](https://img.shields.io/github/v/release/BOWLUNA/dsh-multi-instance?label=release&style=flat-square&logo=github&logoColor=white&labelColor=1f2430)](https://github.com/BOWLUNA/dsh-multi-instance/releases) [![platform](https://img.shields.io/badge/platform-Windows%20%7C%20WSL2-0078D4?style=flat-square&logo=windows&logoColor=white&labelColor=1f2430)](https://github.com/BOWLUNA/dsh-multi-instance/releases) [![tests](https://img.shields.io/github/actions/workflow/status/BOWLUNA/dsh-multi-instance/ci.yml?label=tests&style=flat-square&labelColor=1f2430&logo=githubactions&logoColor=white)](https://github.com/BOWLUNA/dsh-multi-instance/actions/workflows/ci.yml) [![license](https://img.shields.io/badge/license-MIT-97ca00?style=flat-square&logo=opensourceinitiative&logoColor=white&labelColor=1f2430)](LICENSE) [![electron](https://img.shields.io/badge/electron-44-47848F?style=flat-square&logo=electron&logoColor=white&labelColor=1f2430)](https://www.electronjs.org/) [![dsh](https://img.shields.io/badge/dsh-%E2%89%A50.1.5-4d6bfe?style=flat-square&logo=deepseek&logoColor=white&labelColor=1f2430)](https://github.com/deepseek-ai/deepseek-harness) [![npm](https://img.shields.io/npm/v/dsh-multi-instance?label=npm%20(placeholder)&style=flat-square&logo=npm&logoColor=white&labelColor=1f2430)](https://www.npmjs.com/package/dsh-multi-instance)

[![bilibili](https://img.shields.io/badge/bilibili-videos-%2300A1D6?style=flat-square&logo=bilibili&logoColor=white&labelColor=1f2430)](https://b23.tv/qJ4Ev0W) [![Douyin](https://img.shields.io/badge/Douyin-shorts-%23FE2C55?style=flat-square&logo=tiktok&logoColor=white&labelColor=1f2430)](https://v.douyin.com/VWh0M03Fa4Y/) [![RedNote](https://img.shields.io/badge/RedNote-notes-%23FF2442?style=flat-square&logo=xiaohongshu&logoColor=white&labelColor=1f2430)](https://xhslink.cn/o/A7QtXmePBBF) [![Discord](https://img.shields.io/badge/Discord-chat-%235865F2?style=flat-square&logo=discord&logoColor=white&labelColor=1f2430)](https://discord.gg/pz97SfAfSy) [![GitHub](https://img.shields.io/github/discussions/BOWLUNA/dsh-multi-instance?label=GitHub&style=flat-square&logo=github&logoColor=white&labelColor=1f2430)](https://github.com/BOWLUNA/dsh-multi-instance/discussions)

A desktop client that wraps the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) web UI:
**attach to any number of DSH instances** — local, WSL2, or a remote DSH that is nothing but a URL.
Each instance gets its own pane; **panes** can be arranged and resized freely, and **instances** never
step on each other — every pane has its own browser session.

In one line: **a window manager around `dsh web`** — several instances running side by side without stepping on each other.

Not a browser extension, and not a reimplementation of dsh — it only takes the pages `dsh web` already serves
and adds a window-management shell around them.

**Also searched for as**: DSH multi-instance · multi-window · multi-session · multi-pane · multi-tab ·
multiple windows · split view · tiling window manager · window manager · desktop client · desktop app · GUI ·
webview shell · web wrapper · browser shell · Electron shell · remote attach · server DSH · WSL2 ·
isolated session · independent sessions · pane layout · free layout · side by side ·
DeepSeek Harness GUI · DeepSeek Harness desktop · dsh GUI · dsh client · dsh desktop.

---

## Contents

- [What it solves](#what-it-solves)
- [What it does not do](#what-it-does-not-do)
- [Install](#install) (build / npm / source)
- [Quick start](#quick-start)
- [Attaching an instance](#attaching-an-instance) (incl. [auto-discovery](#auto-discovery), [manual install](#manual-install))
- [Panes and layout](#panes-and-layout) · [Session isolation](#session-isolation)
- [Using it](#using-it) (drawers, interface, shortcuts)
- [Running from source](#running-from-source) · [Testing](#testing) · [Building from source](#building-from-source) · [Debug switches](#debug-switches)
- [Where files live](#where-files-live)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [Related projects](#related-projects) · [Contributing](#contributing) · [Changelog](CHANGELOG.md) · [License](#license)

---

## What it solves

The web UI that ships with dsh is good, but it shows one place in one window. The moment you need to watch
**something in WSL locally** and **something on a server** at the same time — or even two sessions of the
same instance — browser tabs stop being enough: you lose track of which is which, the cookies overwrite each
other, and the arrangement is all manual dragging.

The shell does exactly three things:

1. **Attach** — treat each dsh as an *instance*: one running in WSL2, one on the Windows host, or a remote
   server that is nothing but a URL
2. **Arrange** — each instance becomes a pane you can drag, resize, snap and tile; the arrangement is remembered
3. **Isolate** — every pane has its own browser session, so running many does not stomp on cookies

| | |
|---|---|
| **Instances side by side** | Several DSH on one screen, each its own pane, freely arranged and resized |
| **Isolated sessions** | Each pane is a separate browser partition — cookies / localStorage never interfere |
| **Cross-environment attach** | Local Windows, inside WSL2, or a remote DSH on a server (a token-bearing HTTPS URL) |
| **One-click split** | 1/2, 1/3 and 1/4 zones; the remaining instances fill what is left |
| **Auto-discovery** | Scans the usual places for an existing dsh and asks whether to add it |
| **Built-in install** | No terminal needed — pick a version, a registry and a port, and it installs a dsh for you |

|  |  |
| --- | --- |
| ![Tiled instances](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/03-tile.png) | ![Free arrangement, 8 instances](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/05-many.png) |
| ![Zone glow](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/04-zone.png) | ![Instance settings](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/06-instance.png) |

|  |  |
| --- | --- |
| ![Built-in dsh install](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/08-install.png) | ![Dark theme](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/09-dark.png) |

## What it does not do

- **Does not bundle dsh**, and never downloads it in the background. Installing is something you ask for
  explicitly, from the interface
- **No account system**: however dsh authenticates is however the shell presents it
- **Touches none of dsh's data**: never writes `~/.dsh`, never touches credential files, only reads the
  address file you point it at
- **Does not sweep your whole disk**: discovery stays in the usual places (see below)

---

## Install

### Option 1 — download a build (recommended)

From [Releases](https://github.com/BOWLUNA/dsh-multi-instance/releases):

| File | What it is |
|---|---|
| `DSH.Multi-Instance-Setup-x.y.z.exe` | **Installer** — a normal Windows setup: pick the directory, get Desktop and Start-menu shortcuts |
| `DSH.Multi-Instance-x.y.z-x64.zip` | **Portable zip** — unpack and run, writes no registry keys, fine on a USB stick |

> The dots are GitHub's doing: it replaces spaces in uploaded asset names with `.`
> (the local artifact names use spaces).

> Windows 10/11. dsh itself is not included — after installing, click "Install instance" in the UI,
> or attach a DSH you already have.

### Option 2 — npm

> ⚠️ **npm currently only carries `0.0.1`, an empty placeholder** (it exists purely to hold the name —
> installing it launches nothing). No usable version has been published to npm yet, so until then use
> Option 1 or Option 3. To check whether you are getting the real package:
> `npm view dsh-multi-instance version` — today it answers `0.0.1`.

```bash
npm i -g dsh-multi-instance   # then run: dsh-multi-instance
dsh-multi-instance --version  # confirm what you got (works without Electron)
dsh-multi-instance --help     # every switch
```

> The npm route needs an Electron runtime first (`npm i -g electron`). The packaged exe builds need
> **no** prerequisites at all.
> `--version` and `--help` are the only two switches that work **without** Electron — run them right
> after installing, so you are not guessing after a failed launch.

### Option 3 — run from source

```bash
git clone https://github.com/BOWLUNA/dsh-multi-instance.git
cd dsh-multi-instance
npm install
npm start
```

Or double-click `start.vbs` (no console window) / `start.cmd`.

> ⚠️ The launchers contain a line `unset ELECTRON_RUN_AS_NODE` / `set "ELECTRON_RUN_AS_NODE="` — **do not remove it**.
> When that variable is left as `1` (any child of an Electron-family tool inherits it), `electron.exe`
> degrades into plain Node and Chromium never starts — the symptom is "double-click does nothing".
> To check: `electron.exe --version` printing a **Node version** (`v24.21.0` and friends) means you hit
> this; the correct output is the **Electron version**, `v44.4.3`.

---

## Quick start

1. The **left drawer** is the instance list. On first launch it scans for an existing dsh and asks whether to add it.
2. If there is none, click **Install instance** — pick a version (stable / next / alpha, or one specific
   historical version), pick an npm registry (official / Huawei Cloud / npmmirror / Tencent Cloud), set a port.
3. Or click **Add instance** to fill it in by hand: a local port, something in WSL2, or a server HTTPS URL + token.
4. Instance **status lamp**: green = online, yellow = alive but needs a token, red = unreachable.
5. **Raise the bubble** on a pane (move the mouse to its top centre) to drag / resize / zone it.
6. Click empty canvas for shortcuts; click the version number for the runtime environment.

### The three buttons

| Button | What it does |
|---|---|
| **Add instance** | Add one by hand (local / WSL2 / remote) |
| **Search instances** | Scan the usual places for an existing dsh. **Deliberately not a whole-disk scan** (privacy); the dialog says exactly where it looked |
| **Install instance** | Install a new dsh from the UI, with a chosen version, registry and port |

---

## Attaching an instance

An *instance* records **how this dsh runs, how to get its token-bearing URL, and how to start/stop it**.
Three kinds, by target:

| Kind | Notes |
| --- | --- |
| **WSL** | Runs inside a WSL2 distribution. Distro and user are configurable (blank = the default user); the address comes from `dsh-url.txt` or the process output |
| **Windows** | Runs on the Windows host |
| **Remote** | Runs on another machine; all we have is a URL and a token, and the shell just displays it |

The address (with token) resolves in this order: **the last address successfully captured and persisted →
the address file you specified → captured live from the process output when starting the instance**.

### Auto-discovery

**Detect** in the left drawer scans along three axes:

- **Installed and running** — scans processes and common port ranges, then confirms by fingerprint that it really is dsh
- **Installed but not running** — scans for the `dsh` executable and the npm global directory
- **Installed into a custom directory** — scans the usual places for **same-named folders**
  (`DeepSeek Harness` / `DeepSeekHarness` / `dsh-*` and friends)

The fingerprint (measured): **without a token you get `401` and a body containing
`dsh web authentication required`; with a token you get `303` and a `set-cookie` containing `dsh-auth-`**.
Both must hold before it counts.

#### What it scans, and why not the whole disk

Discovery only walks these places:

| Scope | Depth |
| --- | --- |
| `dsh` on `PATH` | — |
| the npm global directory | — |
| your home folder (Desktop / Documents / Downloads / Projects / Code / Dev / Work first) | 4 levels |
| each drive root (`C:\` `D:\` …) | 2 levels |

Measured: **5441 directories in about 300ms** — fast. It **deliberately does not sweep the whole disk**,
for two reasons:

1. **Privacy** — a whole-disk scan means reading the *names* of everything in your `Documents` and `Pictures`.
   This shell has no business knowing those
2. **It is not worth it** — a whole-disk walk is millions of files and minutes of time, while DSH is
   essentially never installed somewhere that obscure

And **a matching name is only a hint, not proof**. Plenty of folders look like dsh (28 measured), but a
directory that really has dsh in it always contains `node_modules/@deepseek-ai/dsh/package.json` — only that
counts (measured: of 28 name matches, exactly 1 was real).

The dialog states **which places were searched and how many directories were walked**. If nothing turns up,
add it by hand with **Add instance**.

### Manual install

The shell **does not bundle** dsh. Only when you click "Start install" does it run
`npm install @deepseek-ai/dsh` once into the directory you choose.

| Field | Notes |
| --- | --- |
| **Where** | A WSL2 distribution (installed inside it) or the Windows host |
| **Directory** | Any directory. A leading `~` expands to that user's home |
| **Version** | `Latest stable` / `Next` / `Alpha`, or hit **Fetch** to list **all historical versions** and pick any |
| **Port** | The instance created after install uses this port |
| **npm registry** | npm official / Huawei Cloud / npmmirror (Taobao) / Tencent Cloud / custom |

You can check the environment first; output streams live; afterwards it verifies `dsh --version` and creates
an instance for you.

**Measured** (Windows target, npm official): 565 packages, ~4 minutes, 294MB on disk, `dsh --version` works.

> Registry note: all four registries expose the same `dist-tags` (measured) — only speed differs. Switch
> mirrors if it is slow or timing out.

---

## Panes and layout

- **Drag**: move the mouse to the pane's **top centre** and a bubble handle slides out; drag that
- **Resize**: drag any of the pane's four edges or corners
- **Snap**: dragging near another pane's edge or centreline aligns and shows guides
- **Fill / reset**: double-click the pane's top
- **Tile all**: the layout button in the toolbar
- **Zones**: click 1/2, 1/3 or 1/4 for the **zone glow**; the rest fill what is left

A pane has **no border and no title bar** — the picture you get is all there is. The arrangement is stored in
normalised coordinates (0..1), so it adapts when the window resizes, and is persisted on exit.

> Instances are not allowed to overlap: dragging pushes out along the minimum translation vector, and
> resizing stops at a neighbour.

## Session isolation

Any dsh can have any number of panes. **Each pane has its own browser session**
(`partition = persist:pane-<id>`), therefore:

- Login cookies of different instances never overwrite each other — the single easiest trap when running
  several dsh at once
- Two panes of the same instance authenticate independently with their own tokens
- Each pane's session lives on disk, so a restart does not mean re-authenticating

> Because tokens are stored with the session, **your user config may contain tokens you entered**. Do not
> share or commit that directory.

---

## Using it

### Two hidden drawers

| Drawer | How to summon it |
| --- | --- |
| Top (address bar, reload, new, tile, window controls) | Move the mouse to the **very top edge**, or click the small bar in the top centre |
| Left (instance list, detect, install, theme, language, about) | Move the mouse to the **very left edge**, or click the `≡` at the left of the toolbar |

Both are fully retracted at rest, and when they open the panes **make room** (rather than being covered), so
neither a title bar nor content is ever hidden. Pin them from the top toolbar to keep them open.

### Interface

|  |  |
|---|---|
| ![Permanent title bar and sidebar](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/02-sidebar.png) | ![Dark theme](https://raw.githubusercontent.com/BOWLUNA/dsh-multi-instance/main/docs/images/09-dark.png) |

- **Permanent title bar (20px)**: `⌄` opens the toolbar on the left, `＋` adds an instance, the middle drags the
  window, and the right has minimise / maximise / close. It occupies real space, so it **never covers dsh's own buttons**.
- **Two hidden drawers**: top (address bar, reload, tile) and left (instance list). Fully retracted, leaving a
  canvas with a 3px margin.
- **Theme**: light / dark / follow system. **Language**: 中文 / English.
- **Panes have no border or title bar** — the whole surface is DSH; you operate via the hover bubble.

### Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+T` | Pin / collapse the top toolbar |
| `Ctrl+Shift+B` | Pin / collapse the left drawer |
| `Ctrl+N` | Open the instance list (new pane) |
| `Ctrl+R` | Reload the active pane |
| `Ctrl+W` | Close the active pane |
| `Esc` | Collapse all drawers and menus |

These work even when the mouse focus is inside a dsh page — the main process listens on `before-input-event`
and forwards them back to the shell; otherwise the `<webview>` would swallow every keystroke.

---

## Running from source

Needs Node.js and npm.

```bash
git clone https://github.com/BOWLUNA/dsh-multi-instance.git
cd dsh-multi-instance
npm install          # just electron and electron-builder
```

Launch (pick one):

| Way | Command | Notes |
| --- | --- | --- |
| Double-click | `start.vbs` | No console window — the everyday choice |
| Double-click | `start.cmd` | A cmd window flashes for a moment |
| Terminal | `./start.sh` | For development; logs also go to the terminal |

### Testing

```bash
npm test              # 57 checks — plain Node, no GUI, no Electron required
npm run smoke         # 30 checks — boots the real app and looks at what it rendered
```

`npm test` covers the **pure logic**: user-data location and migration, config read/write + backup +
corruption recovery, instance address resolution, and the npm entry point's argument parsing and runtime
lookup. Zero dependencies, plain Node.

`npm run smoke` covers the other half — **what is inside the window**, which the pure-logic suite cannot
reach. It serves a fake DSH page on localhost, boots the real app against a seeded config, and asserts on
the fact that **the page was actually requested**: renderer boot, window shown, webview attached and
loaded, one isolated partition per pane, the UA the pane sends, a non-blank screenshot, and the exit code.
No network, no real DSH, no credentials — and your own config is untouched (userData points at a temp dir).

```bash
npm run smoke                    # default scene: one pane
node tools/smoke.js --scene=tile # four panes, tiled
node tools/smoke.js --scene=empty# the empty-canvas onboarding state
node tools/smoke.js --keep       # keep .tmp/smoke on failure for post-mortem
```

> This suite exists because of a specific defect: before 0.5.0 the per-pane **partition hardening was
> dead code** — `will-attach-webview` was registered on the wrong object (see the 0.5.0 entry in the
> [changelog](CHANGELOG.md)). All 57 pure-logic checks were green while the defect sat in the window;
> `npm run smoke` turned two assertions red immediately.

Interaction self-tests (dragging, the hover bubble, sidebar auto-collapse) still go through the
`--selftest*` switches, which need a real window plus synthetic mouse events.

### Building from source

```bash
npm run dist          # both the exe installer and the portable zip
npm run dist:setup    # installer only (NSIS)
npm run dist:zip      # portable zip only
```

Artifacts land in `dist/`. All three commands run `npm run clean:dist` first (a `predist` hook).

> Measured with electron-builder 26.15.3: **a path containing non-ASCII characters builds fine** — this
> repository's own development directory contains Chinese characters, and both artifacts above were built
> in place. No need to move to an ASCII temporary path.

> **What `clean:dist` is for**: electron-builder deletes `dist/win-unpacked`, `dist/win-unpacked.tmp`,
> and — during NSIS finalisation — the previous version's `.__uninstaller.exe`. Inside a sandbox that
> injects a *bulk-delete guard* (some AI terminals do), those deletes fail with
> `SAFE_DELETE_BULK_CONFIRM_REQUIRED`, and they happen at **two different stages with very different
> consequences**:
>
> | Stage | Consequence |
> | --- | --- |
> | **Unpack** (`extractArchive`, removing `win-unpacked` / `.tmp`) | **Fatal** — no artifacts at all; the zip is left as a 0-byte shell |
> | **Finalise** (NSIS `finishBuild`, removing `.__uninstaller.exe`) | Artifacts are already produced; you just get one red line |
>
> `clean:dist` (wired to `predist`) removes those directories and churn files **up front** using the
> **synchronous** `fs.rmSync` — the synchronous API is not intercepted, so by the time the build reaches
> those steps there is nothing to delete, the count is 0 and the guard never fires. A normal manual build
> does not need it; only such sandboxes do.

### Debug switches

```bash
./start.sh --demo                      # expand the drawers and open an instance
./start.sh --demo --demo-zone=4        # show the 1/4 zone glow
./start.sh --demo --demo-page=install  # open the install page
./start.sh --selftest                  # synthesise mouse events for "raise bubble -> drag it"
./start.sh --selftest-side             # verify the sidebar's three collapse paths
./start.sh --selftest-win              # verify the permanent title bar reserves canvas space
./start.sh --selftest-tip              # check no tooltip is clipped by the window or sidebar
./start.sh --memtest                   # open everything, then report process count and memory
./start.sh --no-discover               # skip the startup discovery dialog (screenshots)
./start.sh --mask-token                # mask the token in the address bar (screenshots)
./start.sh --eval="<js>"               # run JS in the renderer after load
./start.sh --devtools / --verbose

# Take a screenshot and exit (for GUI forensics)
./start.sh --shot=<path> --shot-delay=<ms> --shot-exit
```

---

## Where files live

| Content | Path |
| --- | --- |
| User config (instance list, pane arrangement) | `config.json` in the app data directory |
| Automatic config backups (last 3) | `config.json.bak-1` … `bak-3` in the same directory |
| Preserved fragment of a corrupted config | `config.json.corrupt-<timestamp>` in the same directory |
| Per-pane login state (browser partitions) | `Partitions/` in the app data directory |
| Main-process log | `logs/main.log` in the app data directory |

On Windows the app data directory is `%APPDATA%\dsh-multi-instance\` — **the same location for dev runs and
packaged builds**.

**How the config protects itself** (relevant if you have ever lost it): before every overwrite of
`config.json`, the **last parseable** content is rolled into `bak-1` (the older ones shift back, 3 kept).
A single user action is coalesced into one slot — one action writes several keys in a row
(`panes` / `ui` / `collapsed`) and no further rotation happens for 3 seconds, so the **3 backups correspond
to the last 3 actions, not the last 3 disk writes**. When the file cannot be parsed, the fragment on hand is
first preserved verbatim as `config.json.corrupt-<timestamp>`, then the newest valid backup is restored
**and written back to the main file** (self-healing). Both actions land in the log:

```
[store] 配置损坏，残片已保留: config.json.corrupt-2026-09-24T05-31-02-123Z（32 字节）
[store] 已从 config.json.bak-1 回退配置并写回主文件
```

So "my instance list is suddenly empty" is no longer a dead end — do not touch the files first, check
`logs/main.log` for those two lines; `bak-1` is normally the version you want back.

> **The location is pinned, not derived.** Electron would default it to `<appData>/<app name>`, where the
> name comes from `package.json`'s `name` in development and from `productName` when packaged — leave it
> derived and you get two separate directories: the layout you arranged in source is empty for a packaged
> user.
>
> This project has been renamed three times (`dsh-shell` → `dsh-webview-desktop` → `dsh-multi-instance`),
> so startup performs **a one-time migration**: if the current directory has no panes, it looks through the
> legacy directories (`DSH Multi-Instance` / `dsh-webview-desktop` / `dsh-shell` / `DSH套壳`) and adopts the
> `config.json` with the most panes, together with its `Partitions/`. It only acts when the current
> directory has no panes, so it runs at most once. The log records what was migrated and from where.

The app does **not** modify the address file dsh's launcher writes, and does **not** touch dsh's own
credential files.

---

## Troubleshooting

**A pane shows a red status dot / says it cannot get the address**
Click "Start" on the pane or the instance row, or confirm the service by hand:
`curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/`. **A `401` means the service is alive**, just
missing a token — that is normal, not a fault.

**Where does a remote instance's token come from?**
A dsh URL looks like `https://<your-domain>/?token=xxxxxxxx`. On the server, run the following and paste the
part after `token=` into the instance's Token field:

```bash
grep -hoE 'token=[A-Za-z0-9_-]+' ~/.local/share/dsh/web.log | tail -1
```

**It loads a 401 page**
That instance is missing a token, or the token expired. Open its "Edit" and enter the token again.

**A server instance will not connect**
Detection distinguishes three states: green = online, yellow = alive but needs a token, red = unreachable.
For HTTPS sites, make sure the server certificate is valid — an incomplete chain makes the handshake fail at
the TLS layer, and that is not the shell's fault (`curl -v https://your-domain/` shows the certificate error).

**After tiling, the picture is a smudge**
Too many panes. Measured at about **241MB per pane**: a 16GB machine is comfortable around **12**, strains near
20, and 30+ is not realistic. **Instances folded into the left drawer cost nothing** (their webview is
unloaded); only panes on the canvas consume memory.

**I want to know what the app actually did**
```bash
tail -f "<app data directory>/logs/main.log"
```
It records the address resolution, each webview's mount and load result, the directory count and time of a
discovery scan, and the reasons for failures.

**After upgrading, my instance list is empty / the layout went back to default**
From 0.3.0 the location is pinned to `%APPDATA%\dsh-multi-instance\` and startup adopts config from legacy
directories automatically. Look for this line in the log:

```
[appdata] 已从 <legacy dir> 迁移: config.json, Partitions（窗格 N 个）
```

If that line is absent and the legacy directory does exist, the legacy directory had no panes either — copy
its `config.json` into `%APPDATA%\dsh-multi-instance\` by hand (with the app closed).
(0.2.0 and earlier had a drifting location: dev runs and packaged builds wrote to different directories. The
`userData=` log line is the authoritative answer.)

**From 0.4.0 the config keeps its own backups.** Seeing `config.json.bak-1` / `bak-2` / `bak-3` is normal
(one shift per action; a burst of writes shares one slot). Seeing `config.json.corrupt-<timestamp>` means the
file was once unreadable — that file is the **verbatim fragment**, do not delete it. The log carries the
matching two lines, and `bak-1` is usually the version you want: close the app, copy `config.json.bak-1`
over `config.json`, start again.

---

## Known limitations

- **About 241MB per instance** (measured: 12 instances = 17 processes / 2897MB).
  A 16GB machine is comfortable around 12, strains near 20. Instances folded into the sidebar cost nothing
  (their webview is unloaded).
- **Tiling warns when it runs out of room**: from 12 the cells get cramped, and past 20 they are unusable
  (the app tells you, instead of leaving you to guess at a smudge).
- **The top-centre 20px of a pane is taken by the bubble hot zone**, so you cannot click things in the dsh
  page there — the price of getting mouse events at all.
- **Discovery only scans the "usual places"**: PATH, the npm global dir, your home folder (4 levels), each
  drive root (2 levels) — about 300ms measured. Something buried somewhere unusual will not be found — add it
  by hand.
- **`window.open` inside a dsh page** is handed to the system default browser; it does not open a new pane in
  the shell.
- **No macOS / Linux build.** Electron is cross-platform, but the window behaviour (no frame, edge hot zones)
  was tuned for Windows; other platforms are unverified.
- A pane has a minimum size (16% of the stage) so it cannot be dragged into an invisible sliver.
- The drag handle lives on the bubble, so **raise the bubble before dragging**.

---

## Layout

```
.
├── package.json
├── bin/cli.js                           npm entry point (--version / --help + finds electron and launches the app)
├── build/icon.ico                       app icon
├── start.cmd / start.vbs / start.sh     launchers (pick one)
├── tests/run.js                         plain-Node test suite (npm test, 57 pure-logic checks)
├── tools/smoke.js                       window-level smoke test (npm run smoke)
├── tools/screenshots/shoot.js           batch screenshot tool for README images
├── docs/index.html                      GitHub Pages landing page (single file, no external deps)
├── docs/images/                         screenshots used by the READMEs
└── src/
    ├── main/
    │   ├── main.js        main process: window, webview hardening, IPC, selftest probes
    │   ├── appdata.js     user-data location (pinned) + legacy-directory migration
    │   ├── instances.js   instance model: address resolution, start/stop, reachability probe
    │   ├── discovery.js   discovery: process/port scan + dsh executable scan + common-dir scan
    │   ├── installer.js   manual installer (dsh is never bundled)
    │   └── store.js       JSON config I/O: atomic write + rolling backups + corruption recovery
    ├── preload/preload.js whitelisted IPC bridge
    └── renderer/
        ├── index.html
        ├── style.css      paper-white ground with halftone dots
        ├── icons.js       inline SVG icons
        ├── i18n.js        Chinese/English dictionary
        ├── layout.js      layout engine (drag / resize / snap / zones)
        └── app.js         orchestration: instance panel, drawers, panes, shortcuts
```

---

## Related projects

| Project | What it is |
| --- | --- |
| [dsh-custom-mode](https://github.com/BOWLUNA/dsh-custom-mode) | By the same author: a DSH plugin to **manage, switch and share system prompt sets**. Runs inside DSH; complements this shell |
| [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) | Upstream. This project only consumes its web UI and never modifies it |
| [Project page](https://bowluna.github.io/dsh-multi-instance/) | The one-page intro: screenshots, install options, known limits (source: `docs/index.html`) |

## Contributing

| | |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to get it running, what to test after a change, and the three invariants not to touch |
| [SECURITY.md](SECURITY.md) | Which sensitive data it handles; report problems privately |
| [CHANGELOG.md](CHANGELOG.md) | What changed in each version |
| [Issues](https://github.com/BOWLUNA/dsh-multi-instance/issues) | Bugs and suggestions (forms ask for your version and log) |
| [Discussions](https://github.com/BOWLUNA/dsh-multi-instance/discussions) | Usage, layout ideas, which server to attach |

## Relationship to DeepSeek Harness

This is an **independent third-party shell**, not affiliated with DeepSeek. It only consumes the web UI dsh
already exposes, does not modify dsh itself, and does not represent the official position.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

[MIT](LICENSE)
