# dsh-multi-instance

**English** | [简体中文](README.md)

A desktop shell that wraps the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (dsh) web UI:
**multi-instance panes that attach to any number of DSH instances by URL** — local, WSL2, or a remote server.
Multi-window layout with free arrange and resize; one isolated browser session per pane.

It is not a browser extension and not a reimplementation of dsh — it is a window-management shell around the pages `dsh web` already serves.

---

## What it solves

The web UI that ships with dsh works well, but you can only look at one place, in one window. When you need to watch
**one instance inside local WSL** and **another one on a server** at the same time (or two different sessions of the same instance),
browser tabs stop being enough: you lose track of which is which, cookies overwrite one another, and the layout is all manual.

This shell does exactly three things:

1. **Attach** — every dsh becomes an "instance": one running inside WSL2, one running on Windows itself, or a remote server that is just a URL
2. **Arrange** — each instance opens as a pane you can drag, resize, snap and tile; the layout is remembered
3. **Isolate** — every pane has its own browser session, so multiple panes never trample each other's cookies

## What it does not do

- **It does not bundle dsh** and never downloads it in the background. Installing is an explicit "Start install" click
- **It has no account system**: however dsh authenticates is however the shell presents it
- **It touches none of dsh's data**: it never writes `~/.dsh`, never touches credential files, and only reads the address file you point it at

---

## Attaching an instance

An instance describes **how that dsh runs, how to obtain its token-bearing URL, and how to start and stop it**. There are three kinds:

| Kind | Meaning |
| --- | --- |
| **WSL** | Runs inside a WSL2 distribution. You can pick the distribution and user; the address comes from `dsh-url.txt` or the process output |
| **Windows** | Runs natively on Windows |
| **Remote** | Runs on another machine; you only have a URL and a token, and the shell just displays it |

The token-bearing URL is resolved in this order: **the last address captured and persisted → the address file you configured → captured live from the process output when the instance is started**.

### Auto-discovery

The "Detect" action in the left drawer scans along two axes:

- **Installed and running** — scans processes and common port ranges, then confirms the port really belongs to dsh
- **Installed but not started** — scans for the `dsh` executable and npm global directories to recover the binary path

The confirmation signature (measured): **without a token the server answers `401` with a body containing `dsh web authentication required`; with a token it answers `303` with `dsh-auth-` in `set-cookie`.** Both must match.

### Manual install

The shell does **not** bundle dsh. Only when you click "Start install" does it run `npm install @deepseek-ai/dsh` once into the directory you choose —
either a Windows directory or a directory inside a WSL distribution (node/npm must already exist there). It defaults to the Huawei Cloud npm mirror and passes
the `--allow-scripts` allow-list that npm 11 started requiring for native module builds.

---

## Panes and layout

- **Drag**: hold the pane's title bar
- **Resize**: drag any of the four edges or four corners
- **Snap**: dragging near another pane's edge or center line aligns automatically and shows guide lines
- **Fill / restore**: double-click the pane's title bar
- **Tile all**: the layout button in the toolbar
- **Zones**: split the stage into regions and assign panes to them

Layout is stored as normalized coordinates (0..1), so it adapts when the window is resized; it is persisted on exit and restored on the next launch.

## Session isolation

The same dsh can be opened in any number of panes. **Each pane has its own browser session** (`partition = persist:pane-<id>`), therefore:

- Login cookies from different instances never overwrite each other — the easiest trap to fall into when multi-opening dsh
- Two panes on the same instance authenticate independently with their own tokens and do not affect each other
- Each pane's session lives on disk, so a restart does not force re-authentication

> Because tokens are stored with the session, **the user config may contain tokens you entered**. Do not share that directory or commit it to Git.

---

## Using it

### Two hidden drawers

| Drawer | How to summon it |
| --- | --- |
| Top (address bar, reload, new, tile, window controls) | Move the mouse to the **very top edge** of the window, or click the small bar at the top center |
| Left (instance list, detect, install, theme, language, about) | Move the mouse to the **very left edge** of the window, or click the `≡` at the far left of the toolbar |

The drawers are fully collapsed by default, and opening one makes the stage **give way** rather than covering it, so title bars and content are never hidden.
Pin the top toolbar if you want it to stay.

### Shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl+Shift+T` | Pin / collapse the top toolbar |
| `Ctrl+Shift+B` | Pin / collapse the left drawer |
| `Ctrl+N` | Open the instance list (new pane) |
| `Ctrl+R` | Reload the current pane |
| `Ctrl+W` | Close the current pane |
| `Esc` | Collapse all drawers and menus |

These keep working while the mouse focus is inside the dsh page itself — the main process listens for `before-input-event` and forwards it back to the shell,
because `<webview>` otherwise swallows all keyboard events.

---

## Running from source

Node.js and npm are required.

```bash
git clone https://github.com/BOWLUNA/dsh-multi-instance.git
cd dsh-multi-instance
npm install          # installs electron only
```

Start it (pick one):

| Way | Command | Notes |
| --- | --- | --- |
| Double-click | `start.vbs` | No console flash; the everyday option |
| Double-click | `start.cmd` | A cmd window flashes briefly |
| Terminal | `./start.sh` | For development; logs go to the terminal as well |

> ⚠️ All three launchers contain a line that must stay — `unset ELECTRON_RUN_AS_NODE` /
> `set "ELECTRON_RUN_AS_NODE="` / `WshShell.Environment("PROCESS").Remove(...)`.
> If that variable is left at `1` (it is always inherited when launched from a child process of an Electron-based tool), `electron.exe`
> **degrades into plain Node**, Chromium never starts, and the symptom is "double-click does nothing".
> Quick self-check: `electron.exe --version` should print `v40.10.2`; if it prints `v24.x`, that is the culprit.

### Debug switches

```bash
./start.sh --demo                  # expand both drawers and lay out an unequal-width split (for screenshots / walkthroughs)
./start.sh --devtools              # open DevTools for the renderer
./start.sh --verbose               # also stream logs to the terminal
./start.sh --demo --selftest       # synthesize real mouse events to drag a title bar and resize from the bottom-right corner, logging rects

# Take a screenshot and exit (for GUI forensics)
./start.sh --shot=<path> --shot-delay=<ms> --shot-exit
```

---

## Where files live

| What | Path |
| --- | --- |
| User config (instance list, pane layout) | `config.json` under the app data directory |
| Main process log | `logs/main.log` under the app data directory |

The app never modifies the address file written by your dsh launcher, and never touches dsh's own credential files.

---

## Troubleshooting

**A pane shows a red dot / says it cannot get the address**
Click "Start" on that pane or instance entry, or check the service by hand: `curl -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/`.
**A `401` means the service is alive** — it is merely missing a token, which is normal, not a failure.

**Where do remote instance tokens come from**
A dsh URL looks like `https://<your-domain>/?token=xxxxxxxx`. On the server, run the following and copy everything after `token=` into the instance's Token field:

```bash
grep -hoE 'token=[A-Za-z0-9_-]+' ~/.local/share/dsh/web.log | tail -1
```

**The loaded page is a 401 page**
This instance has no token, or the token has expired. Open "Edit" on the instance and fill it in again.

**Want to know what the app actually did**
```bash
tail -f "<app data directory>/logs/main.log"
```
It records address resolution, each webview's mount and load result, probe results and failure reasons.

---

## Known limitations

- **Webview only, no account system**: however dsh authenticates is however the shell presents it
- **`window.open` inside a dsh page** is handed to the system default browser; it does not open a new pane inside the shell
- **No packaged installer yet**: it currently runs via `electron .`
- A pane has a minimum size (12% of the stage) so it cannot be dragged into an invisible sliver
- Primarily targets **Windows (including WSL2)**; other platforms are unverified

---

## Layout

```
.
├── package.json
├── start.cmd / start.vbs / start.sh     launchers (pick one)
└── src/
    ├── main/
    │   ├── main.js        main process: window, webview hardening, IPC, self-test instrumentation
    │   ├── instances.js   instance model: address resolution, start/stop, reachability probes
    │   ├── discovery.js   auto-discovery: process/port scan + dsh executable scan
    │   ├── installer.js   manual installer (does not bundle dsh)
    │   └── store.js       JSON config read/write
    ├── preload/preload.js whitelisted IPC bridge
    └── renderer/
        ├── index.html
        ├── style.css      paper-white + halftone-dot visual language
        ├── icons.js       inline SVG icons
        ├── i18n.js        Chinese/English dictionaries
        ├── layout.js      layout engine (drag / resize / snap / zones)
        └── app.js         orchestration: instance panel, drawers, panes, shortcuts
```

---

## Relationship to DeepSeek Harness

This is an **independent third-party shell** with no affiliation to DeepSeek. It only consumes the web UI dsh already exposes,
does not modify dsh itself, and does not represent the official project.

## License

[MIT](LICENSE)
