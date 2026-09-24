'use strict';

/**
 * DSH 套壳 · 主进程
 *
 * 职责：
 *  1. 无边框窗口（顶部/左侧设置栏由渲染层做成隐藏式抽屉）
 *  2. 为每个实例的 <webview> 加固 session（独立 partition、统一 UA）
 *  3. IPC：实例增删改查 / 地址解析 / 起停 / 自动发现 / 手动安装 DSH
 *
 * 注意：本进程由 electron.exe 启动，若父环境残留 ELECTRON_RUN_AS_NODE=1，
 * electron 会退化成纯 Node 而不起 Chromium —— 启动脚本里已清除该变量。
 */

const { app, BrowserWindow, ipcMain, session, shell, dialog, nativeTheme, webContents } = require('electron');
const path = require('path');
const fs = require('fs');

const Store = require('./store');
const inst = require('./instances');
const discovery = require('./discovery');
const installer = require('./installer');
const appdata = require('./appdata');

// ---------------------------------------------------------------- 用户数据落点

/**
 * ★ 必须在**任何** `app.getPath('userData')` 之前钉死落点。
 *
 * Electron 默认把它算成 `<appData>/<app.getName()>`，而 `getName()` 在开发态取
 * `package.json` 的 `name`、在打包态取 electron-builder 的 `productName` ——
 * 不钉死就是两套目录：开发时排好的布局，打包版用户看不到；反之亦然。
 *
 * 同时做一次旧目录迁移（这个项目改过三次名字），把实例列表、窗格排布和
 * 持久化的登录态接过来，而不是留在原地。
 */
const APPDATA_BOOT = appdata.bootstrap({
  logger: (m) => console.log(m),
});
app.setPath('userData', APPDATA_BOOT.userData);

// ---------------------------------------------------------------- 参数

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
}
function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

const SHOT_PATH = argValue('shot');
const SHOT_DELAY = Number(argValue('shot-delay') || 3500);
const SHOT_EXIT = hasFlag('shot-exit');
const DEMO = hasFlag('demo');
const DEMO_ZONE = argValue('demo-zone');   // 演示分区光晕：1/2/3/4
const DEMO_PAGE = argValue('demo-page');   // 演示二级页：edit / install
/** 演示用：把一个实例指向指定地址（拍干净截图时用，避免暴露真实会话内容） */
const DEMO_URL = argValue('demo-url');
/** 演示用：复制几个实例（展示多实例平铺） */
const DEMO_URL_COUNT = argValue('demo-url-count');
const SELFTEST = hasFlag('selftest');
/** 自测：侧栏的展开 / 收起 / 钉住三条路径 */
const SELFTEST_SIDE = hasFlag('selftest-side');
/** 调试：加载后在渲染层执行一段 JS */
const EVAL_JS = argValue('eval');
/** 自测：右上角窗口控制会不会挡住 DSH 自己的按钮 */
const SELFTEST_WIN = hasFlag('selftest-win');
/** 自测：侧栏底部按钮的悬停提示会不会被窗口底边切掉 */
const SELFTEST_TIP = hasFlag('selftest-tip');
/** 多实例压测：全部打开后统计进程数与内存占用 */
const MEMTEST = hasFlag('memtest');
/** 关掉启动时的自动发现（截图/演示用 —— 弹窗会盖住画面） */
const NO_DISCOVER = hasFlag('no-discover');
/** 地址栏里的 token 打码（截图用，避免凭证进公开图片） */
const MASK_TOKEN = hasFlag('mask-token');

// ---------------------------------------------------------------- 日志

let logStream = null;
function log(...parts) {
  const line = `[${new Date().toISOString()}] ${parts.join(' ')}`;
  try {
    if (!logStream) {
      const dir = path.join(app.getPath('userData'), 'logs');
      fs.mkdirSync(dir, { recursive: true });
      logStream = fs.createWriteStream(path.join(dir, 'main.log'), { flags: 'a' });
    }
    logStream.write(line + '\n');
  } catch { /* 日志失败不能影响主流程 */ }
  if (hasFlag('verbose')) process.stdout.write(line + '\n');
}

// ---------------------------------------------------------------- 窗口

let mainWindow = null;
let store = null;
const runningChildren = new Map(); // instanceId -> ChildProcess

function chromeUA() {
  const v = process.versions.chrome || '144.0.0.0';
  return (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
    `(KHTML, like Gecko) Chrome/${v} Safari/537.36`
  );
}

const hardened = new Set();
function hardenSession(partition) {
  const key = partition || 'default';
  if (hardened.has(key)) return session.fromPartition(partition);
  hardened.add(key);

  const ses = session.fromPartition(partition);
  ses.setUserAgent(chromeUA());
  ses.setPermissionRequestHandler((_wc, permission, callback) => {
    const allowed = new Set([
      'clipboard-read',
      'clipboard-sanitized-write',
      'fullscreen',
      'notifications',
      'media',
    ]);
    callback(allowed.has(permission));
  });
  return ses;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 940,
    minHeight: 600,
    frame: false,
    show: false,
    backgroundColor: '#f6f3e9',
    title: 'DSH 套壳',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: true,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (hasFlag('devtools')) mainWindow.webContents.openDevTools({ mode: 'detach' });
    log('窗口已显示');
  });

  const pushMaxState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('win:maximized', mainWindow.isMaximized());
    }
  };
  mainWindow.on('maximize', pushMaxState);
  mainWindow.on('unmaximize', pushMaxState);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  if (SELFTEST) scheduleSelfTest();
  if (SELFTEST_SIDE) scheduleSideTest();
  if (SELFTEST_WIN) scheduleWinCtlTest();
  if (SELFTEST_TIP) scheduleTipTest();
  if (MEMTEST) runMemTest();
  if (EVAL_JS) runEval(EVAL_JS);
  if (SHOT_PATH) scheduleShot(SHOT_PATH, SHOT_DELAY);
  return mainWindow;
}

/**
 * 自测：遍历所有带悬停提示的按钮，检查提示框会不会被裁掉。
 * 判据两条 —— 越出窗口边界，或越出侧栏边界（侧栏有 overflow:hidden，会被裁）。
 * 提示宽度用真实样式量（伪元素读不到 rect），再按 data-tip-pos 推算位置。
 */
function scheduleTipTest() {
  const js = (code) => mainWindow.webContents.executeJavaScript(code, true);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  setTimeout(async () => {
    try {
      // 展开侧栏，让侧栏内的按钮可测
      await js(`document.querySelector('#btnSidePin').click(); 'ok'`);
      await wait(800);
      // 再展开上侧工具栏
      await js(`document.querySelector('#btnTopCtl').click(); 'ok'`);
      await wait(800);

      const r = await js(`(() => {
        const WIN_W = window.innerWidth;
        const side = document.querySelector('#sidebar');
        const sr = side.getBoundingClientRect();

        const probe = document.createElement('span');
        probe.style.cssText =
          'position:absolute;visibility:hidden;white-space:nowrap;' +
          'font-size:11px;line-height:1.4;padding:4px 9px;font-family:inherit;';
        document.body.append(probe);

        const bad = [];
        let checked = 0;

        document.querySelectorAll('[data-tip]').forEach((el) => {
          const text = el.getAttribute('data-tip');
          if (!text) return;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          if (el.closest('[hidden]')) return;
          const pos = el.getAttribute('data-tip-pos') || 'center';

          probe.textContent = text;
          const w = Math.ceil(probe.getBoundingClientRect().width);

          let left;
          if (pos === 'start' || pos === 'top') left = r.left;
          else if (pos === 'end') left = r.right - w;
          else if (pos === 'left') left = r.left - 8 - w;
          else left = r.left + r.width / 2 - w / 2;
          const right = left + w;

          checked += 1;
          const overWin = left < 0 || right > WIN_W;
          const inSide = r.left >= sr.left - 1 && r.left < sr.right;
          const overSide = inSide && (left < sr.left + 1 || right > sr.right - 1);

          if (overWin || overSide) {
            bad.push({
              id: el.id || el.className,
              text, pos,
              left: Math.round(left), right: Math.round(right),
              overWin, overSide,
            });
          }
        });

        probe.remove();
        return {
          winW: WIN_W,
          side: [Math.round(sr.left), Math.round(sr.right)],
          checked, bad,
        };
      })()`);

      log(`tip-test: 检查 ${r.checked} 个提示 | 窗口宽 ${r.winW} | 侧栏 ${JSON.stringify(r.side)}`);
      if (!r.bad.length) {
        log('tip-test: 全部提示都在可见范围内 ✓');
      } else {
        for (const b of r.bad) {
          log(
            `tip-test: 越界 → ${b.id} "${b.text}" pos=${b.pos} ` +
              `[${b.left},${b.right}] 越窗口=${b.overWin} 越侧栏=${b.overSide}`
          );
        }
      }
    } catch (err) {
      log(`tip-test 失败: ${err.message}`);
    }
  }, 2600);
}

/**
 * 自测：常驻标题栏有没有真正让出空间。
 * 判据 —— 画布顶端必须落在标题栏底边之下，这样窗口按钮就不可能盖到 DSH 的任何东西。
 */
function scheduleWinCtlTest() {
  const js = (code) => mainWindow.webContents.executeJavaScript(code, true);

  setTimeout(async () => {
    try {
      const r = await js(`(() => {
        const tb = document.querySelector('#titlebar');
        const st = document.querySelector('#stage');
        const cb = document.querySelector('#btnWinClose');
        if (!tb || !st || !cb) return null;
        const t = tb.getBoundingClientRect();
        const s = st.getBoundingClientRect();
        const c = cb.getBoundingClientRect();
        return {
          titlebarH: Math.round(t.height),
          titlebarBottom: Math.round(t.bottom),
          stageTop: Math.round(s.top),
          closeBtn: { x: Math.round(c.left), y: Math.round(c.top), w: Math.round(c.width) },
          closeVisible: getComputedStyle(cb).visibility !== 'hidden' && c.width > 0,
        };
      })()`);

      if (!r) {
        log('win-test: 标题栏元素缺失 ✗');
        return;
      }
      log(`win-test: ${JSON.stringify(r)}`);
      log(
        `win-test: 标题栏底=${r.titlebarBottom} 画布顶=${r.stageTop} → ` +
          (r.stageTop >= r.titlebarBottom ? '画布已让位，零冲突 ✓' : '重叠 ✗')
      );
      log(`win-test: 关闭按钮常驻可见 = ${r.closeVisible}`);
    } catch (err) {
      log(`win-test 失败: ${err.message}`);
    }
  }, 2600);
}

/**
 * 多实例压测：把配置里的实例全部打开并平铺，然后统计进程数与内存。
 * 用 app.getAppMetrics() 拿真实数据（渲染层看不到自己的进程内存）。
 */
function runMemTest() {
  setTimeout(async () => {
    try {
      const n = await mainWindow.webContents.executeJavaScript(
        `(async () => {
           const insts = window.__dsh.instances();
           await Promise.all(insts.map((it) => window.__dsh.openInstance(it.id).catch(() => 'x')));
           window.__dsh.layout.tileAll();
           return window.__dsh.layout.list().length;
         })()`,
        true
      );
      log(`memtest: 已打开并平铺 ${n} 个实例，等待渲染稳定…`);

      await new Promise((r) => setTimeout(r, 15000));

      const metrics = app.getAppMetrics();
      const byType = {};
      let totalKb = 0;
      for (const m of metrics) {
        const kb = (m.memory && m.memory.workingSetSize) || 0;
        totalKb += kb;
        const t = m.type || 'unknown';
        byType[t] = byType[t] || { n: 0, mb: 0 };
        byType[t].n += 1;
        byType[t].mb += kb / 1024;
      }

      const parts = Object.entries(byType)
        .sort((a, b) => b[1].mb - a[1].mb)
        .map(([k, v]) => `${k}=${v.n}个/${v.mb.toFixed(0)}MB`);

      log(`memtest: 实例数=${n} 进程总数=${metrics.length} 总内存=${(totalKb / 1024).toFixed(0)}MB`);
      log(`memtest: 分类 ${parts.join('  ')}`);
      log(`memtest: 单实例均值 ≈ ${(totalKb / 1024 / Math.max(1, Number(n))).toFixed(0)}MB`);
    } catch (err) {
      log(`memtest 失败: ${err.message}`);
    }
    app.exit(0);
  }, 4000);
}

/** 调试：加载完成后在渲染层跑一段 JS，把结果落日志（截图前改状态用） */
function runEval(code) {  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const r = await mainWindow.webContents.executeJavaScript(code, true);
        log(`eval → ${JSON.stringify(r)}`);
      } catch (err) {
        log(`eval 失败: ${err.message}`);
      }
    }, 1500);
  });
}

/**
 * 自测：侧栏能不能真的收起来。
 * 覆盖三条路径 —— 鼠标移开自动收、侧栏内收起键、钉住后不再自动收。
 */
function scheduleSideTest() {
  const js = (code) => mainWindow.webContents.executeJavaScript(code, true);
  const send = (ev) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.sendInputEvent(ev);
  };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const state = () =>
    js(`(() => {
      const s = document.querySelector('.sidebar');
      const p = document.querySelector('#btnSidePin');
      return { show: s.classList.contains('show'), pinned: p.classList.contains('on') };
    })()`);
  const step = async (label) => log(`side-test: ${label} → ${JSON.stringify(await state())}`);

  setTimeout(async () => {
    try {
      await step('初始');

      send({ type: 'mouseMove', x: 10, y: 420 });
      await wait(500);
      await step('鼠标碰左边缘');

      send({ type: 'mouseMove', x: 940, y: 520 });
      await wait(1000);
      await step('鼠标移开（应自动收起）');

      send({ type: 'mouseMove', x: 10, y: 420 });
      await wait(500);
      await step('再次碰左边缘');

      await js(`document.querySelector('#btnSideClose').click()`);
      await wait(400);
      await step('点侧栏内的收起键（应收起）');

      send({ type: 'mouseMove', x: 10, y: 420 });
      await wait(500);
      await js(`document.querySelector('#btnSidePin').click()`);
      await wait(300);
      await step('碰边缘后点图钉（应钉住）');

      send({ type: 'mouseMove', x: 940, y: 520 });
      await wait(1000);
      await step('钉住后鼠标移开（应保持展开）');

      await js(`document.querySelector('#btnSidePin').click()`);
      await wait(1000);
      await step('取消钉住后（应自动收起）');
    } catch (err) {
      log(`side-test 失败: ${err.message}`);
    }
  }, 2600);
}

/** GUI 取证：把窗口渲染结果截成 PNG */
function scheduleShot(file, delay) {
  mainWindow.webContents.once('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const img = await mainWindow.webContents.capturePage();
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, img.toPNG());
        log(`截图已保存: ${file}`);
      } catch (err) {
        log(`截图失败: ${err.message}`);
      }
      if (SHOT_EXIT) app.quit();
    }, delay);
  });
}

/**
 * 自测：先让渲染层把气泡亮起来，再用合成鼠标事件真的拖一把，
 * 验证「气泡作为拖动把手」这条链路。
 */
function scheduleSelfTest() {
  const js = (code) => mainWindow.webContents.executeJavaScript(code, true);
  const send = (ev) => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.sendInputEvent(ev);
  };

  setTimeout(async () => {
    try {
      // 不依赖 --demo：自测自己把第一个实例打开
      await js(
        `(async () => { window.__dsh && await window.__dsh.openInstance(); return true; })()`
      );
      await new Promise((r) => setTimeout(r, 2600));

      // 先把实例缩到半屏，否则铺满状态下根本没有可移动空间
      await js(`window.__dsh && window.__dsh.setRect(0, 0, 0.46, 0.6)`);
      await new Promise((r) => setTimeout(r, 600));

      const info = await js(`(() => {
        const p = document.querySelector('.pane');
        if (!p) return null;
        const r = p.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      })()`);
      log(`selftest: 起手窗格 ${JSON.stringify(info)}`);
      if (!info) return;

      const hx = info.x + Math.round(info.w / 2);
      const hy = info.y + 18;

      // 1) 鼠标划到实例上方中央，唤醒气泡
      send({ type: 'mouseMove', x: hx, y: hy + 60 });
      await new Promise((r) => setTimeout(r, 140));
      send({ type: 'mouseMove', x: hx, y: hy });
      await new Promise((r) => setTimeout(r, 800));

      const bubbleShown = await js(`window.__dsh ? window.__dsh.bubbleShown() : false`);
      log(`selftest: 气泡是否滑出 = ${bubbleShown}`);

      // 2) 抓住气泡左侧的「名称区」把它拖走（中间是按钮，会被按钮拦下）
      const bub = await js(`(() => {
        const b = document.querySelector('.bubble');
        if (!b) return null;
        const r = b.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      })()`);
      log(`selftest: 气泡 rect=${JSON.stringify(bub)}`);
      if (!bub) return;

      const from = {
        x: Math.round(bub.x + bub.w * 0.13),
        y: Math.round(bub.y + bub.h / 2),
      };
      const to = { x: from.x + 300, y: from.y + 300 };
      send({ type: 'mouseDown', x: from.x, y: from.y, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 12; i += 1) {
        await new Promise((r) => setTimeout(r, 26));
        send({
          type: 'mouseMove',
          x: Math.round(from.x + ((to.x - from.x) * i) / 12),
          y: Math.round(from.y + ((to.y - from.y) * i) / 12),
          button: 'left',
        });
      }
      await new Promise((r) => setTimeout(r, 90));
      send({ type: 'mouseUp', x: to.x, y: to.y, button: 'left', clickCount: 1 });
      log('selftest: 拖拽结束');

      await new Promise((r) => setTimeout(r, 500));
      const after = await js(`(() => {
        const p = document.querySelector('.pane');
        const r = p.getBoundingClientRect();
        return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
      })()`);
      log(`selftest: 拖动后 ${JSON.stringify(after)}`);
    } catch (err) {
      log(`selftest 失败: ${err.message}`);
    }
  }, 2800);
}

// ---------------------------------------------------------------- webview

app.on('web-contents-created', (_event, contents) => {
  const type = contents.getType();

  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      if (type === 'webview') {
        log(`webview 内请求新窗口，转系统浏览器: ${url}`);
        shell.openExternal(url).catch(() => {});
      } else if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('shell:open-request', url);
      }
    }
    return { action: 'deny' };
  });

  if (type !== 'webview') return;

  contents.on('will-attach-webview', (_e, webPreferences, params) => {
    hardenSession(params.partition);
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    log(`webview 挂载 partition=${params.partition} src=${params.src}`);
  });

  contents.on('did-finish-load', () => log(`webview 加载完成 id=${contents.id} url=${contents.getURL()}`));
  contents.on('did-fail-load', (_e, code, desc, url) =>
    log(`webview 加载失败 id=${contents.id} code=${code} ${desc} url=${url}`)
  );
  contents.on('render-process-gone', (_e, details) =>
    log(`webview 渲染进程退出 id=${contents.id} reason=${details.reason}`)
  );
  contents.on('console-message', (_e, level, message) => {
    if (level >= 2) log(`webview console[${level}] ${String(message).slice(0, 200)}`);
  });

  // webview 聚焦时宿主收不到键盘事件 —— 在这里桥接回去
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control) return;
    const k = String(input.key || '').toLowerCase();
    let hot = null;
    if (input.shift && k === 't') hot = 'toggle-top';
    else if (input.shift && k === 'b') hot = 'toggle-side';
    else if (!input.shift && k === 'r') hot = 'reload';
    else if (!input.shift && k === 'w') hot = 'hide-pane';
    else if (!input.shift && k === 'n') hot = 'new-pane';
    if (!hot) return;
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('shell:hotkey', hot);
    }
  });

  // 画面被 webview 占满，宿主的 mousemove 收不到 —— 从主进程旁路回传坐标。
  // （注意：合成事件不一定触发它，渲染层另有一层兜底热区，两条路并存。）
  let inputEventCount = 0;
  contents.on('input-event', (_e, input) => {
    if (!input) return;
    const type = input.type;
    if (type !== 'mouseMove' && type !== 'mouseDown') return;
    inputEventCount += 1;
    if (inputEventCount === 1 || inputEventCount % 300 === 0) {
      log(`webview input-event #${inputEventCount} type=${type} at (${input.x},${input.y})`);
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('webview:mouse', {
        id: contents.id,
        x: input.x,
        y: input.y,
        type,
      });
    }
  });
});

// ---------------------------------------------------------------- 实例存取

function currentInstances() {
  const saved = store.get('instances', null);
  if (!Array.isArray(saved) || !saved.length) return inst.defaultInstances();
  return saved;
}

function writeInstances(list) {
  store.set('instances', list);
}

function findInstance(id) {
  return currentInstances().find((x) => x.id === id) || null;
}

function patchInstance(id, patch) {
  const list = currentInstances();
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  writeInstances(list);
  return list[idx];
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

// ---------------------------------------------------------------- IPC

function registerIpc() {
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    userData: app.getPath('userData'),
    demo: DEMO,
    demoZone: DEMO_ZONE,
    demoPage: DEMO_PAGE,
    demoUrl: DEMO_URL,
    demoUrlCount: DEMO_URL_COUNT,
    noDiscover: NO_DISCOVER,
    maskToken: MASK_TOKEN,
  }));

  // ---- 实例 ----
  ipcMain.handle('instances:list', () => currentInstances());

  ipcMain.handle('instances:save', (_e, payload) => {
    if (!payload || !payload.id) return { ok: false, error: '缺少 id' };
    const list = currentInstances();
    const idx = list.findIndex((x) => x.id === payload.id);
    if (idx >= 0) list[idx] = { ...list[idx], ...payload };
    else list.push(payload);
    writeInstances(list);
    return { ok: true, instances: list };
  });

  ipcMain.handle('instances:remove', (_e, id) => {
    const list = currentInstances().filter((x) => x.id !== id);
    writeInstances(list);
    return { ok: true, instances: list };
  });

  ipcMain.handle('instances:reset', () => {
    const list = inst.defaultInstances();
    writeInstances(list);
    return { ok: true, instances: list };
  });

  ipcMain.handle('instance:resolve', async (_e, id) => {
    const it = findInstance(id);
    const r = await inst.resolveUrl(it);
    log(`resolve ${id} → ${r.ok ? 'ok(' + r.from + ')' : 'fail: ' + r.error}`);
    return r;
  });

  ipcMain.handle('instance:probe', async (_e, id) => {
    const it = findInstance(id);
    if (!it) return { ok: false, error: '实例不存在' };

    // 远程实例可以直接探 URL；本机实例先看端口在不在
    if (it.target === 'remote') {
      const r = await inst.probe(it.url || '');
      const state = !r.alive ? 'stopped' : r.authRequired && !it.token ? 'needToken' : 'running';
      return { ok: true, probe: r, state };
    }

    const open = await inst.portOpen(it.port || 3080);
    if (!open) return { ok: true, probe: { alive: false }, state: 'stopped' };

    const resolved = await inst.resolveUrl(it);
    if (!resolved.ok) {
      return { ok: true, probe: { alive: true, needsToken: true }, state: 'running' };
    }
    const r = await inst.probe(resolved.url);
    return { ok: true, probe: r, state: r.alive ? 'running' : 'stopped', url: resolved.url };
  });

  ipcMain.handle('instance:start', async (_e, id) => {
    const it = findInstance(id);
    if (!it) return { ok: false, error: '实例不存在' };

    // 已经活着就直接返回
    if (it.target !== 'remote' && (await inst.portOpen(it.port || 3080))) {
      log(`start ${id}: 端口已在监听，跳过启动`);
      return { ok: true, already: true };
    }

    const r = inst.start(it, (text) => {
      sendToRenderer('instance:log', { id, text });
      const m = String(text).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]+/);
      if (m) {
        log(`捕获访问地址 ${id} → ${m[0].replace(/token=.*/, 'token=***')}`);
        patchInstance(id, { lastUrl: m[0] });
        sendToRenderer('instance:url', { id, url: m[0] });
      }
    });

    if (r.ok) runningChildren.set(id, r.child);
    log(`start ${id} → ${r.ok ? 'pid=' + r.pid : r.error}`);
    return r.ok ? { ok: true, pid: r.pid } : r;
  });

  ipcMain.handle('instance:stop', (_e, id) => {
    const it = findInstance(id);
    if (!it) return { ok: false, error: '实例不存在' };
    const child = runningChildren.get(id);
    const r = inst.stop(it);
    try {
      if (child) child.kill();
    } catch { /* ignore */ }
    runningChildren.delete(id);
    log(`stop ${id} → ${JSON.stringify(r)}`);
    return r;
  });

  // ---- 自动发现 ----
  ipcMain.handle('discover:run', async () => {
    const r = await discovery.discover({ existing: currentInstances() });
    const s = r.scan || {};
    log(
      `discover → ${r.list.length} 个候选 | 目录扫描 ${s.dirs || 0} 个 / ${s.ms || 0}ms / ` +
        `撞名 ${s.hits || 0} / 剪枝 ${s.pruned || 0}${s.truncated ? ' / 超预算截断' : ''}`
    );
    if (r.list.length) log(`discover 候选: ${r.list.map((f) => f.key).join(', ')}`);
    return { ok: true, found: r.list, scan: r.scan };
  });

  // ---- 手动安装 DSH ----
  ipcMain.handle('install:check', async (_e, opts) => {
    const r = await installer.checkEnv(opts || {});
    log(`install:check → ${JSON.stringify(r)}`);
    return r;
  });

  ipcMain.handle('install:run', async (_e, opts) => {
    const r = installer.install(opts || {}, (text) => {
      sendToRenderer('install:log', text);
    });
    if (!r.ok) return r;

    return await new Promise((resolve) => {
      r.child.on('close', (code) => {
        log(`install 结束 code=${code} bin=${r.bin}`);
        resolve({ ok: code === 0, code, bin: r.bin });
      });
      r.child.on('error', (err) => resolve({ ok: false, error: err.message }));
    });
  });

  // ---- 主题 ----
  // 把壳的主题转成 nativeTheme.themeSource。
  // DSH 页面设成「跟随系统」时看的是 prefers-color-scheme，
  // 这一条能让它们跟着壳一起变，不至于壳是浅色、里面还是深色。
  ipcMain.on('theme:set', (_e, pref) => {
    const src = pref === 'light' || pref === 'dark' ? pref : 'system';
    nativeTheme.themeSource = src;
    log(`theme:set ${pref} → themeSource=${nativeTheme.themeSource} dark=${nativeTheme.shouldUseDarkColors}`);
  });

  ipcMain.handle('install:versions', async (_e, opts) => {
    const r = await installer.listVersions(opts || {});
    log(
      `install:versions → ${r.versions.length} 个版本, ` +
        `tags=${JSON.stringify(r.tags)} (源 ${(opts && opts.registry) || 'default'})`
    );
    return r;
  });

  ipcMain.handle('install:verify', async (_e, opts) => {
    const r = await installer.verify(opts || {});
    log(`install:verify → ${JSON.stringify(r)}`);
    return r;
  });

  // ---- 目录选择 ----
  ipcMain.handle('pickDir', async (_e, opts = {}) => {
    const r = await dialog.showOpenDialog(mainWindow, {
      title: opts.title || '选择安装目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: opts.defaultPath || undefined,
    });
    if (r.canceled || !r.filePaths.length) return { ok: false };
    return { ok: true, dir: r.filePaths[0] };
  });

  // ---- 状态 ----
  ipcMain.handle('state:load', () => ({
    panes: store.get('panes', []),
    ui: store.get('ui', {}),
    collapsed: store.get('collapsed', []),
  }));

  ipcMain.handle('state:save', (_e, state) => {
    if (!state) return { ok: false };
    if (Array.isArray(state.panes)) store.set('panes', state.panes);
    if (state.ui) store.set('ui', state.ui);
    if (Array.isArray(state.collapsed)) store.set('collapsed', state.collapsed);
    return { ok: true };
  });

  ipcMain.handle('dsh:openExternal', (_e, url) => {
    if (!/^https?:\/\//i.test(url)) return { ok: false, error: '只允许 http/https' };
    shell.openExternal(url).catch(() => {});
    return { ok: true };
  });

  /**
   * 在某个 webview 内部跑一段 JS。
   *
   * 只给自动化取证用（截图脚本要能点掉 dsh 的首次启动弹窗）。
   * `<webview>` 内部的 DOM 宿主完全看不到 —— 它跑在独立进程里 —— 所以只能这样投递。
   * 出于安全，仅在带调试开关启动时开放。
   */
  ipcMain.handle('webview:exec', async (_e, wcId, code) => {
    if (!EVAL_JS && !SHOT_PATH) return { ok: false, error: '未启用（需要 --eval 或 --shot）' };
    if (typeof code !== 'string' || code.length > 20000) {
      return { ok: false, error: '代码不合法' };
    }
    const wc = webContents.fromId(Number(wcId));
    if (!wc || wc.isDestroyed()) return { ok: false, error: '找不到该 webview' };
    try {
      const result = await wc.executeJavaScript(code, true);
      return { ok: true, result: typeof result === 'string' ? result.slice(0, 500) : String(result) };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });

  // ---- 窗口控制 ----
  ipcMain.on('win:minimize', () => mainWindow && mainWindow.minimize());
  ipcMain.on('win:toggleMaximize', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('win:close', () => mainWindow && mainWindow.close());

  ipcMain.on('log:write', (_e, msg) => log('[renderer]', String(msg)));
}

// ---------------------------------------------------------------- 生命周期

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(() => {
    store = new Store(path.join(app.getPath('userData'), 'config.json'));
    session.defaultSession.setUserAgent(chromeUA());
    registerIpc();
    createWindow();
    log(`应用启动 electron=${process.versions.electron} chrome=${process.versions.chrome}`);
    log(`userData=${app.getPath('userData')}`);
    log(
      `appdata: 落点已钉死=${APPDATA_BOOT.userData === app.getPath('userData')} ` +
        `迁移=${APPDATA_BOOT.result.action}${
          APPDATA_BOOT.result.copied && APPDATA_BOOT.result.copied.length
            ? ` (${APPDATA_BOOT.result.copied.join(', ')} ← ${APPDATA_BOOT.plan.fromName})`
            : ''
        }`
    );
  });
}
