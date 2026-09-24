'use strict';

/**
 * DSH 套壳 · 渲染层编排
 *
 * 三块东西：侧栏（实例列表 + 二级设置页）、画布（无边框实例 + 悬停气泡）、全局偏好（主题/语言）。
 */
const api = window.shell;
const $ = (s) => document.querySelector(s);

const dom = {
  app: $('.app'),
  stage: $('#stage'),
  guides: $('#guides'),
  shield: $('#shield'),
  zones: $('#zones'),
  topbar: $('#topbar'),
  sidebar: $('#sidebar'),
  leftReveal: $('#leftReveal'),
  instList: $('#instList'),
  emptyState: $('#emptyState'),
  toast: $('#toast'),
  menu: $('#menu'),
  discover: $('#discover'),
  discList: $('#discList'),
  discDesc: $('#discDesc'),
  discScope: $('#discScope'),
  addrBar: $('#addrBar'),
  bubble: $('#bubble'),
  bubbleName: $('#bubbleName'),
  verLabel: $('#verLabel'),

  pageEdit: $('#pageEdit'),
  pageInstall: $('#pageInstall'),
  editTitle: $('#editTitle'),
  iLog: $('#iLog'),
  iEnv: $('#iEnv'),
};

const BUBBLE_H = 34;      // 气泡触发：实例顶部这么多像素内
const BUBBLE_W_RATIO = 0.3;

/** 运行期状态 */
let instances = [];
let instState = new Map();      // instanceId -> 状态字符串
const paneByWcId = new Map();   // webContentsId -> paneId
const wcIdByPane = new Map();   // paneId -> webContentsId
let collapsed = new Set();      // 收起的实例 id（进程还活着，只是没上画布）
let ui = { theme: 'light', lang: 'zh', topPinned: false, sidePinned: false };
let appInfo = null;
let layout = null;
let idSeq = 0;

let bubblePaneId = null;
let bubbleTimer = null;
let bubbleEditing = false;
let bubbleHover = false;

// ---------------------------------------------------------------- 工具

const newId = (p) => `${p}${Date.now().toString(36)}${(++idSeq).toString(36)}`;

function hostOf(url) {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

function instById(id) {
  return instances.find((x) => x.id === id) || null;
}

function stateOf(id) {
  return instState.get(id) || 'stopped';
}

let toastTimer = null;
function toast(msg, isErr = false) {
  dom.toast.textContent = msg;
  dom.toast.classList.toggle('err', !!isErr);
  dom.toast.hidden = false;
  requestAnimationFrame(() => dom.toast.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
    setTimeout(() => {
      dom.toast.hidden = true;
    }, 220);
  }, 2800);
}

/** 给元素挂图标 + 提示 */
function setIcon(el, name, size = 15, tip) {
  el.innerHTML = '';
  el.append(iconEl(name, size, 'ico'));
  if (tip) el.setAttribute('data-tip', tip);
}

/** 给按钮挂图标 + 文案 */
function setBtnLabel(el, icon, label, size = 13) {
  if (!el) return;
  el.innerHTML = '';
  if (icon) el.append(iconEl(icon, size, 'ico'));
  if (label) el.append(document.createTextNode(label));
}

/** 工具栏与各页的按钮内容（图标全部取自 DSH 官方图标集） */
function initButtons() {
  const ICON_ONLY = [
    ['#btnSidebar', 'panelLeft'],
    ['#btnGo', 'chevronRight'],
    ['#btnReload', 'refresh'],
    ['#btnTile', 'zone4'],
    ['#btnAddInst', 'plus'],
    ['#btnPin', 'pinwheel'],
    ['#btnSideClose', 'chevronLeft'],
    ['#btnSidePin', 'pinwheel'],
    ['#editClose', 'close'],
    ['#installClose', 'close'],
  ];
  for (const [sel, icon] of ICON_ONLY) setBtnLabel($(sel), icon, '');
  // 常驻标题栏
  setBtnLabel($('#btnTopCtl'), 'chevronDown', '', 12);
  setBtnLabel($('#btnTitleAdd'), 'plus', '', 12);
  setBtnLabel($('#btnWinMin'), 'minimize', '', 11);
  setBtnLabel($('#btnWinMax'), 'fullscreen', '', 11);
  setBtnLabel($('#btnWinClose'), 'close', '', 11);
  setBtnLabel($('#iPick'), 'folder', t('install.pick'));
  refreshActionButtons();
}

/** 语言按钮用「文A」图标 —— 单个地球看不出是切语言 */
const LANG_ICON = 'lang';

/** 语言切换时要重刷的带文案按钮 */
function refreshActionButtons() {
  // 实例列表上方那排（带文字）
  setBtnLabel($('#btnNewInst'), 'plus', t('side.btnAdd'));
  setBtnLabel($('#btnDetect'), 'search', t('side.btnSearch'));
  setBtnLabel($('#btnInstall'), 'download', t('side.btnDownload'));

  setBtnLabel($('#editDelete'), 'trash', t('side.remove'));
  setBtnLabel($('#editTest'), 'search', t('edit.test'));
  setBtnLabel($('#editSave'), 'check', t('edit.save'));
  setBtnLabel($('#iCheck'), 'search', t('install.check'));
  setBtnLabel($('#iStart'), 'download', t('install.start'));
  setBtnLabel($('#iLoadVer'), 'refresh', t('install.loadVer'));
  setBtnLabel($('#discIgnore'), null, t('disc.ignore'));
  setBtnLabel($('#discAdd'), 'check', t('disc.add'));
  setBtnLabel($('#btnLang'), LANG_ICON, '', 15);

  // 纯图标按钮的悬停说明。第三项是弹出方向 —— 贴着窗口/侧栏边缘的按钮必须指定，
  // 否则居中的提示会被切掉：'top' 往上(底部按钮) / 'start' 靠左 / 'end' 靠右 / 'left' 往左弹。
  const tips = [
    ['#btnSidebar', t('topbar.sidebar'), 'start'],
    ['#btnGo', t('bubble.reload')],
    ['#btnReload', t('bubble.reload')],
    ['#btnTile', t('topbar.tile'), 'end'],
    ['#btnAddInst', t('side.add'), 'end'],
    ['#btnPin', t('topbar.pin'), 'end'],
    ['#btnSideClose', t('topbar.sideClose'), 'end'],
    ['#btnSidePin', t('topbar.sidePin'), 'end'],
    ['#btnTopCtl', t('topbar.pin'), 'start'],
    ['#btnTitleAdd', t('side.add'), 'start'],
    ['#btnWinMin', t('win.minimize'), 'end'],
    ['#btnWinMax', t('win.maximize'), 'end'],
    ['#btnWinClose', t('close'), 'end'],
    ['#editClose', t('close'), 'end'],
    ['#installClose', t('close'), 'end'],
    ['#btnTheme', `${t('theme.light')} / ${t('theme.dark')} / ${t('theme.auto')}`, 'top'],
    ['#btnLang', `${t('lang.zh')} / ${t('lang.en')}`, 'top'],
  ];
  for (const [sel, tip, pos] of tips) {
    const el = $(sel);
    if (!el) continue;
    el.setAttribute('data-tip', tip);
    if (pos) el.setAttribute('data-tip-pos', pos);
  }
}

// ---------------------------------------------------------------- 主题 / 语言

function resolveTheme(pref) {
  if (pref === 'auto') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return pref === 'dark' ? 'dark' : 'light';
}

function applyTheme(pref) {
  ui.theme = pref;
  const resolved = resolveTheme(pref);
  document.documentElement.setAttribute('data-theme', resolved);
  const iconName = pref === 'auto' ? 'auto' : pref === 'dark' ? 'moon' : 'sun';
  setBtnLabel($('#btnTheme'), iconName, '', 14);

  // 同步给主进程的 nativeTheme —— 这样 webview 里的 DSH 页面
  // 如果设的是「跟随系统」主题，就会跟着壳一起变色。
  // 不同步的话，用户在壳里选了浅色、DSH 内部还是深色，看着像坏了。
  if (api.theme && api.theme.set) api.theme.set(pref);

  saveUi();
}

function applyLang(lang) {
  ui.lang = setLang(lang);
  saveUi();
  refreshAllLabels();
}

/** 语言切换后所有动态生成的文案要重刷 */
function refreshAllLabels() {
  applyI18n(document);
  renderInstances();
  syncBubbleText();
  const et = $('#editTitle');
  if (et && et.dataset.key) et.textContent = t(et.dataset.key);
  // 按钮的图标与文案统一由 refreshActionButtons 处理（含 i18n 与提示方向）
  refreshActionButtons();
  applyTheme(ui.theme);
}

function saveUi() {
  api.state.save({ ui });
}

// ---------------------------------------------------------------- 抽屉

/** 收起后的冷却期：鼠标若正压在左边缘热区上，收起会让热区露出来、立刻又把它弹开 */
let sideHideAt = 0;
const REVEAL_COOLDOWN = 650;

function showTop(on) {
  dom.topbar.classList.toggle('show', on);
  // 注意：这里曾经还有一行 dom.topReveal.classList.toggle(...) ——
  // 那个元素已随「顶部热区」一起删除，留着会抛异常并让下面这行执行不到，
  // 表现就是「展开工具栏时画布不让位」。
  dom.app.classList.toggle('top-open', on);
}

function showSide(on) {
  dom.sidebar.classList.toggle('show', on);
  dom.leftReveal.classList.toggle('hot', on);
  dom.app.classList.toggle('side-open', on);
  if (on) renderInstances();
}

let hideTopTimer = null;
let hideSideTimer = null;
/** 二级页打开等场景要临时把侧栏按住 —— 用引用计数，不去动用户的钉住状态 */
let sideHold = 0;

function holdSide(on) {
  sideHold = Math.max(0, sideHold + (on ? 1 : -1));
  if (sideHold > 0) {
    clearTimeout(hideSideTimer);
    showSide(true);
  } else if (!ui.sidePinned) {
    scheduleHideSide();
  }
}

function scheduleHideTop() {
  if (ui.topPinned) return;
  clearTimeout(hideTopTimer);
  hideTopTimer = setTimeout(() => showTop(false), 380);
}
function scheduleHideSide() {
  if (ui.sidePinned || sideHold > 0) return;
  clearTimeout(hideSideTimer);
  hideSideTimer = setTimeout(() => showSide(false), 380);
}

/** 立刻收起侧栏，并取消钉住 */
function collapseSide() {
  ui.sidePinned = false;
  sideHold = 0;
  clearTimeout(hideSideTimer);
  $('#btnSidePin').classList.remove('on');
  // 鼠标可能正好压在左边缘热区上（比如用快捷键收起）—— 收起会让热区露出来，
  // 不打冷却的话它会立刻被重新展开，看起来就是「收不掉」。
  sideHideAt = Date.now();
  showSide(false);
  saveUi();
}

function setTopPinned(on) {
  ui.topPinned = on;
  $('#btnPin').classList.toggle('on', on);
  $('#btnTopCtl').classList.toggle('on', on);
  if (on) showTop(true);
  saveUi();
}

function setSidePinned(on) {
  ui.sidePinned = on;
  $('#btnSidePin').classList.toggle('on', on);
  if (on) {
    clearTimeout(hideSideTimer);
    showSide(true);
  } else {
    scheduleHideSide();
  }
  saveUi();
}

/** 显示 / 隐藏侧栏（不是切换钉住状态 —— 要常驻请用侧栏底部的图钉） */
function toggleSide() {
  if (dom.sidebar.classList.contains('show')) {
    collapseSide();
  } else {
    ui.sidePinned = false;
    $('#btnSidePin').classList.remove('on');
    clearTimeout(hideSideTimer);
    showSide(true);
    saveUi();
  }
}

/** 二级设置页期间把侧栏按住 */
function openSidebarPinned() {
  holdSide(true);
}

function wireDrawers() {
  // 上侧抽屉：鼠标离开就收。入口是标题栏上那个小三角（不再靠顶部热区 ——
  // 窗口最外 8px 是系统的缩放热区，真实鼠标根本到不了我们手里）
  dom.topbar.addEventListener('mouseenter', () => clearTimeout(hideTopTimer));
  dom.topbar.addEventListener('mouseleave', scheduleHideTop);
  $('#btnTopCtl').addEventListener('click', () => setTopPinned(!ui.topPinned));

  // 左侧抽屉：热区宽度必须超过系统缩放热区，否则真实鼠标推不到
  dom.leftReveal.addEventListener('mouseenter', () => {
    if (Date.now() - sideHideAt < REVEAL_COOLDOWN) return;
    clearTimeout(hideSideTimer);
    showSide(true);
  });
  dom.leftReveal.addEventListener('mouseleave', scheduleHideSide);
  dom.sidebar.addEventListener('mouseenter', () => clearTimeout(hideSideTimer));
  dom.sidebar.addEventListener('mouseleave', scheduleHideSide);

  // ≡ 的语义是「显示 / 隐藏」，不再是切换钉住状态。
  // （之前它 toggle 的是 pin，导致「想收起却反而被钉住」—— 这是这一版修掉的主要毛病）
  $('#btnSidebar').addEventListener('click', toggleSide);

  // 侧栏自己的收起键 —— 不用绕到顶部工具栏去
  $('#btnSideClose').addEventListener('click', collapseSide);
  // 想让它常驻，用底部图钉
  $('#btnSidePin').addEventListener('click', () => setSidePinned(!ui.sidePinned));
}

// ---------------------------------------------------------------- 实例卡片

function stateLabel(s) {
  const key = {
    running: 'state.running',
    stopped: 'state.stopped',
    starting: 'state.starting',
    needToken: 'state.needToken',
    error: 'state.error',
    checking: 'state.checking',
  }[s];
  return key ? t(key) : s;
}

function renderInstances() {
  dom.instList.innerHTML = '';

  if (!instances.length) {
    const empty = document.createElement('div');
    empty.className = 'sb-empty';

    const b = document.createElement('b');
    b.textContent = t('side.empty');
    const hint = document.createElement('div');
    hint.textContent = t('side.emptyHint');

    const addBtn = document.createElement('button');
    addBtn.className = 'btn primary';
    addBtn.style.marginTop = '10px';
    setBtnLabel(addBtn, 'plus', t('side.add'));
    addBtn.addEventListener('click', () => openEditPage(null));

    const detBtn = document.createElement('button');
    detBtn.className = 'btn';
    detBtn.style.marginTop = '6px';
    setBtnLabel(detBtn, 'search', t('side.detect'));
    detBtn.addEventListener('click', () => runDiscover(true));

    empty.append(b, hint, addBtn, detBtn);
    dom.instList.append(empty);
    return;
  }

  for (const it of instances) {
    const st = stateOf(it.id);
    const onCanvas = !!findPaneByInstance(it.id);

    const row = document.createElement('div');
    row.className = 'inst';
    row.dataset.id = it.id;
    if (onCanvas) row.classList.add('on-canvas');

    const lamp = document.createElement('span');
    lamp.className = 'lamp';
    lamp.dataset.s = st;
    lamp.title = stateLabel(st);

    const main = document.createElement('div');
    main.className = 'inst-main';
    const nm = document.createElement('div');
    nm.className = 'inst-name';
    nm.textContent = it.name || it.id;
    const sub = document.createElement('div');
    sub.className = 'inst-sub';
    sub.textContent =
      it.target === 'remote'
        ? it.host || it.url || ''
        : `127.0.0.1:${it.port || 3080}${onCanvas ? ' · ' + t('side.onCanvas') : ''}`;
    main.append(nm, sub);

    const acts = document.createElement('div');
    acts.className = 'inst-acts';

    const mkBtn = (icon, tip, cls, fn) => {
      const b = document.createElement('button');
      b.className = 'iconbtn' + (cls ? ' ' + cls : '');
      setIcon(b, icon, 13, tip);
      b.setAttribute('data-tip-pos', 'left');
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
      return b;
    };

    if (onCanvas) {
      acts.append(
        mkBtn('minimize', t('bubble.minimize'), '', () => collapseInstance(it.id))
      );
    } else {
      acts.append(
        mkBtn('play', t('side.openCanvas'), '', () => openInstance(it.id))
      );
    }
    acts.append(
      mkBtn('stop', t('side.stopProcess'), 'danger', () => stopInstance(it.id)),
      mkBtn('edit', t('side.edit'), '', () => openEditPage(it.id)),
      mkBtn('trash', t('side.remove'), 'danger', () => removeInstance(it.id))
    );

    row.append(lamp, main, acts);
    row.addEventListener('click', () => openInstance(it.id));
    dom.instList.append(row);
  }
}

function setInstState(id, s) {
  instState.set(id, s);
  const row = dom.instList.querySelector(`.inst[data-id="${CSS.escape(id)}"]`);
  if (row) {
    const lamp = row.querySelector('.lamp');
    if (lamp) {
      lamp.dataset.s = s;
      lamp.title = stateLabel(s);
    }
  }
}

// ---------------------------------------------------------------- 实例操作

function findPaneByInstance(instanceId) {
  for (const it of layout.list()) {
    if (it.model.instanceId === instanceId) return it;
  }
  return null;
}

/** 点亮指示灯 */
async function probeInstance(id, silent = true) {
  const it = instById(id);
  if (!it) return 'stopped';
  if (!silent) setInstState(id, 'checking');
  const r = await api.instance.probe(id);
  const s = (r && r.state) || 'stopped';
  setInstState(id, s);
  if (!silent && r && r.probe) {
    const p = r.probe;
    if (!p.alive) toast(t('toast.offline', { err: p.error || '—' }), true);
    else if (p.authRequired && s === 'needToken') toast(t('toast.needToken'));
    else toast(t('toast.online', { code: p.status }));
  }
  return s;
}

async function probeAll() {
  await Promise.all(instances.map((it) => probeInstance(it.id)));
}

/** 点击实例：确保它在跑，然后放上画布 */
async function openInstance(id) {
  const it = instById(id);
  if (!it) return;

  // 已经在画布上 → 聚焦并弹气泡
  const existing = findPaneByInstance(id);
  if (existing) {
    layout.activate(existing.model.id);
    showBubble(existing.model.id, true);
    return;
  }

  collapsed.delete(id);
  persistCollapsed();

  // 演示实例（--demo-url 造的）不在配置里，主进程查不到，必须直接用自带的 url
  if (it.demo && it.url) {
    mountPane(it, it.url);
    return;
  }

  if (it.target === 'remote') {
    const r = await api.instance.resolve(id);
    if (!r.ok) {
      setInstState(id, 'needToken');
      toast(r.error, true);
      openEditPage(id);
      return;
    }
    mountPane(it, r.url);
    probeInstance(id).catch(() => {});
    return;
  }

  // 本机实例：先看活着没
  setInstState(id, 'starting');
  const probe = await api.instance.probe(id);
  let url = probe && probe.url;

  if (!probe || probe.state === 'stopped') {
    toast(t('state.starting') + '…');
    const started = await api.instance.start(id);
    if (!started.ok) {
      setInstState(id, 'error');
      toast(t('toast.startFailed', { name: it.name, err: started.error || '—' }), true);
      return;
    }
    url = await waitForUrl(id, 60000);
    if (!url) {
      setInstState(id, 'error');
      toast(t('toast.noUrl'), true);
      return;
    }
  } else if (!url) {
    const r = await api.instance.resolve(id);
    url = r.ok ? r.url : '';
  }

  if (!url) {
    setInstState(id, 'error');
    toast(t('toast.noUrl'), true);
    return;
  }

  setInstState(id, 'running');
  mountPane(it, url);
  toast(t('toast.started', { name: it.name }));
}

/** 等主进程捕获到访问地址 */
function waitForUrl(instanceId, timeout) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        off();
        resolve(v);
      }
    };
    const off = listenOnce('instance:url', instanceId, (url) => finish(url));

    // 兜底：轮询 resolve
    const started = Date.now();
    const tick = async () => {
      if (done) return;
      const r = await api.instance.resolve(instanceId);
      if (r.ok) return finish(r.url);
      if (Date.now() - started > timeout) return finish('');
      setTimeout(tick, 900);
    };
    setTimeout(tick, 900);
  });
}

const urlWaiters = [];
function listenOnce(channel, instanceId, cb) {
  const fn = (payload) => {
    if (payload && payload.id === instanceId) cb(payload.url);
  };
  const entry = { channel, fn };
  urlWaiters.push(entry);
  return () => {
    const i = urlWaiters.indexOf(entry);
    if (i >= 0) urlWaiters.splice(i, 1);
  };
}
function dispatchWaiter(channel, payload) {
  for (const w of [...urlWaiters]) {
    if (w.channel === channel) w.fn(payload);
  }
}

async function stopInstance(id) {
  const it = instById(id);
  if (!it) return;
  const pane = findPaneByInstance(id);
  if (pane) unmountPane(pane.model.id, { silent: true });
  await api.instance.stop(id);
  setInstState(id, 'stopped');
  toast(t('toast.stopped', { name: it.name }));
  renderInstances();
}

async function removeInstance(id) {
  const it = instById(id);
  if (!it) return;
  const pane = findPaneByInstance(id);
  if (pane) unmountPane(pane.model.id, { silent: true });
  const r = await api.instances.remove(id);
  instances = r.instances;
  instState.delete(id);
  collapsed.delete(id);
  persistCollapsed();
  renderInstances();
  toast(t('toast.removed', { name: it.name || id }));
}

// ---------------------------------------------------------------- 画布 / 窗格

function mountPane(inst, url) {
  // 同一实例只保留一个窗格
  const dup = findPaneByInstance(inst.id);
  if (dup) {
    dup.model.url = url;
    reloadPane(dup.model.id);
    layout.activate(dup.model.id);
    return dup;
  }

  const id = newId('p');
  const model = {
    id,
    instanceId: inst.id,
    title: inst.name,
    url,
    partition: `persist:pane-${inst.id}`,
    x: 0,
    y: 0,
    w: 1,
    h: 1,
  };

  const item = layout.create(model);
  mountWebview(item);
  layout.placeNew(id);

  renderInstances();
  refreshEmpty();
  savePanes();
  return item;
}

function mountWebview(item) {
  item.el.querySelectorAll('.pane-view, .pane-error').forEach((n) => n.remove());

  // 顶部热区：鼠标划到实例上方中央就唤醒气泡（webview 内部事件宿主收不到，必须有这层）
  if (!item.el.querySelector('.hover-zone')) {
    const hz = document.createElement('div');
    hz.className = 'hover-zone';
    hz.addEventListener('mouseenter', () => showBubble(item.model.id));
    hz.addEventListener('mousemove', () => showBubble(item.model.id));
    hz.addEventListener('mouseleave', () => hideBubble());
    item.el.append(hz);
  }

  if (!item.model.url) {
    renderPaneError(item, {
      title: t('toast.noUrl'),
      msg: '',
      actions: [{ label: t('edit.test'), primary: true, fn: () => reloadPane(item.model.id) }],
    });
    return;
  }

  const wv = document.createElement('webview');
  wv.className = 'pane-view';
  wv.setAttribute('partition', item.model.partition);
  wv.setAttribute('allowpopups', 'true');
  wv.setAttribute('src', item.model.url);
  item.el.prepend(wv);

  wv.addEventListener('dom-ready', () => {
    try {
      const wcId = wv.getWebContentsId();
      paneByWcId.set(wcId, item.model.id);
      wcIdByPane.set(item.model.id, wcId);
      api.log(`pane ${item.model.id} inst=${item.model.instanceId} webContentsId=${wcId}`);
    } catch { /* ignore */ }
    if (layout.activeId === item.model.id) syncAddr();
  });

  wv.addEventListener('did-stop-loading', () => {
    if (layout.activeId === item.model.id) syncAddr();
  });

  wv.addEventListener('did-fail-load', (e) => {
    if (e.errorCode === -3 || !e.isMainFrame) return;
    renderPaneError(item, {
      title: '加载失败',
      msg: `${e.errorDescription || ''} (${e.errorCode})\n${e.validatedURL || ''}`,
      actions: [
        { label: t('bubble.reload'), primary: true, fn: () => reloadPane(item.model.id) },
        { label: t('bubble.external'), fn: () => api.openExternal(item.model.url) },
      ],
    });
  });

  wv.addEventListener('render-process-gone', () => {
    renderPaneError(item, {
      title: '渲染进程退出',
      msg: '',
      actions: [{ label: t('bubble.reload'), primary: true, fn: () => reloadPane(item.model.id) }],
    });
  });
}

function renderPaneError(item, { title, msg, actions = [] }) {
  item.el.querySelectorAll('.pane-view, .pane-error').forEach((n) => n.remove());
  const box = document.createElement('div');
  box.className = 'pane-error';
  const tEl = document.createElement('div');
  tEl.className = 'pane-error-title';
  tEl.textContent = title;
  box.append(tEl);
  if (msg) {
    const m = document.createElement('div');
    m.className = 'pane-error-msg';
    m.textContent = msg;
    box.append(m);
  }
  if (actions.length) {
    const acts = document.createElement('div');
    acts.className = 'pane-error-acts';
    for (const a of actions) {
      const b = document.createElement('button');
      b.className = 'btn' + (a.primary ? ' primary' : '');
      b.textContent = a.label;
      b.addEventListener('click', a.fn);
      acts.append(b);
    }
    box.append(acts);
  }
  item.el.prepend(box);
}

function unmountPane(paneId, { silent = false } = {}) {
  const item = layout.get(paneId);
  if (!item) return;
  const instId = item.model.instanceId;
  const wcId = wcIdByPane.get(paneId);
  if (wcId) paneByWcId.delete(wcId);
  wcIdByPane.delete(paneId);

  if (instId) {
    collapsed.add(instId);
    persistCollapsed();
  }
  if (bubblePaneId === paneId) hideBubble(true);
  layout.destroy(paneId);

  renderInstances();
  refreshEmpty();
  savePanes();
  if (!silent) toast(t('zone.collapsed', { n: 1 }));
}

function reloadPane(paneId) {
  const item = layout.get(paneId);
  if (!item) return;
  const wv = item.el.querySelector('.pane-view');
  if (wv) wv.reload();
  else mountWebview(item);
}

function syncAddr() {
  const item = layout.get(layout.activeId);
  const url = item ? item.model.url || '' : '';
  // 截图/演示时把 token 打码 —— 地址栏是画面里最容易漏出凭证的地方
  dom.addrBar.value = appInfo.maskToken ? url.replace(/([?&]token=)[^&]+/i, '$1••••••••') : url;
}

function refreshEmpty() {
  dom.emptyState.hidden = layout.list().length > 0;
}

function savePanes() {
  api.state.save({ panes: layout.snapshot() });
}

function persistCollapsed() {
  api.state.save({ collapsed: [...collapsed] });
}

// ---------------------------------------------------------------- 气泡

/** 气泡是 .app 的绝对定位子元素，所以基准要用 .app，不能用 stage（两者原点差一个工具栏） */
function bubbleGeometry(item) {
  const base = dom.app.getBoundingClientRect();
  const r = item.el.getBoundingClientRect();
  return {
    cx: r.left - base.left + r.width / 2,
    top: r.top - base.top + 7,
    w: r.width,
  };
}

function showBubble(paneId, force = false) {
  const item = layout.get(paneId);
  if (!item) return;
  if (bubbleEditing && !force) return;

  bubblePaneId = paneId;
  const g = bubbleGeometry(item);
  dom.bubble.style.left = `${g.cx}px`;
  dom.bubble.style.top = `${g.top}px`;

  dom.bubbleName.textContent = item.model.title || '—';
  dom.bubbleName.setAttribute('data-tip', t('bubble.renameHint'));

  const connected = !!(item.el.querySelector('.pane-view'));
  setIcon($('#bbMin'), 'minimize', 15, t('bubble.minimize'));
  setIcon($('#bbFill'), 'zone1', 15, t('bubble.fullscreen'));
  setIcon($('#bbZ2'), 'zone2', 15, t('bubble.zone2'));
  setIcon($('#bbZ3'), 'zone3', 15, t('bubble.zone3'));
  setIcon($('#bbZ4'), 'zone4', 15, t('bubble.zone4'));
  $('#bbFill').disabled = !connected;

  dom.bubble.classList.add('show');
  clearTimeout(bubbleTimer);
}

function hideBubble(force = false) {
  if (bubbleEditing && !force) return;
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    dom.bubble.classList.remove('show');
    bubblePaneId = null;
  }, 260);
}

function syncBubbleText() {
  if (!bubblePaneId) return;
  const item = layout.get(bubblePaneId);
  if (item) dom.bubbleName.textContent = item.model.title || '—';
}

function wireBubble() {
  dom.bubble.addEventListener('mouseenter', () => {
    bubbleHover = true;
    clearTimeout(bubbleTimer);
  });
  dom.bubble.addEventListener('mouseleave', () => {
    bubbleHover = false;
    hideBubble();
  });

  // 按住气泡 = 拖动实例（画面被 webview 占满，气泡就是唯一把手）。
  // 名称区既要能拖又要能点着改名，所以用位移阈值区分：动了算拖，没动算点。
  let suppressNameClick = false;

  dom.bubble.addEventListener('mousedown', (e) => {
    if (e.target.closest('button') || e.target.closest('.bubble-input')) return;
    if (!bubblePaneId) return;

    const paneId = bubblePaneId;
    const sx = e.clientX;
    const sy = e.clientY;
    let moved = false;

    const onMove = (ev) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) > 3) moved = true;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener(
      'mouseup',
      () => {
        document.removeEventListener('mousemove', onMove);
        suppressNameClick = moved;
      },
      { once: true }
    );

    layout.startDrag(paneId, e);

    // 拖动期间保持可见
    const keep = setInterval(() => {
      if (bubblePaneId) showBubble(bubblePaneId, true);
      else clearInterval(keep);
    }, 200);
    setTimeout(() => clearInterval(keep), 12000);
  });

  // 点击名称就地改名（拖动过就不算点击）
  dom.bubbleName.addEventListener('click', () => {
    if (suppressNameClick) {
      suppressNameClick = false;
      return;
    }
    beginRename();
  });

  $('#bbMin').addEventListener('click', () => {
    if (bubblePaneId) unmountPane(bubblePaneId);
  });
  $('#bbFill').addEventListener('click', () => {
    if (bubblePaneId) {
      layout.fillAndCollapseOthers(bubblePaneId);
      hideBubble(true);
    }
  });
  $('#bbZ2').addEventListener('click', () => enterZone(2));
  $('#bbZ3').addEventListener('click', () => enterZone(3));
  $('#bbZ4').addEventListener('click', () => enterZone(4));
}

function beginRename() {
  if (!bubblePaneId) return;
  const item = layout.get(bubblePaneId);
  if (!item) return;

  bubbleEditing = true;
  const old = item.model.title || '';
  const input = document.createElement('input');
  input.className = 'bubble-input';
  input.value = old;
  dom.bubbleName.replaceWith(input);
  input.focus();
  input.select();

  const finish = async (commit) => {
    bubbleEditing = false;
    const val = input.value.trim();
    input.replaceWith(dom.bubbleName);
    if (commit && val && val !== old) {
      item.model.title = val;
      await renameInstance(item.model.instanceId, val);
      toast(t('toast.renamed'));
    } else {
      dom.bubbleName.textContent = old;
    }
    savePanes();
    renderInstances();
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
    e.stopPropagation();
  });
  input.addEventListener('blur', () => finish(true));
}

async function renameInstance(instanceId, name) {
  const it = instById(instanceId);
  if (!it) return;
  it.name = name;
  await api.instances.save({ id: instanceId, name });
  // 侧栏与气泡同步
  for (const item of layout.list()) {
    if (item.model.instanceId === instanceId) item.model.title = name;
  }
}

// ---------------------------------------------------------------- 分区

function enterZone(count) {
  if (!bubblePaneId) return;
  const paneId = bubblePaneId;
  dom.bubble.classList.remove('show');
  layout.enterZones(paneId, count);
}

function wireZones() {
  layout.onZoneModeChange = (zone) => {
    if (!zone) return;
    // 分区模式下让两个抽屉收起，别挡着
    if (!ui.topPinned) showTop(false);
    if (!ui.sidePinned) showSide(false);
  };
}

// ---------------------------------------------------------------- 画布事件（来自主进程的 webview 鼠标）

function wireWebviewMouse() {
  api.onWebviewMouse(({ id, x, y, type }) => {
    const paneId = paneByWcId.get(id);
    if (!paneId) return;
    const item = layout.get(paneId);
    if (!item) return;

    if (type === 'mouseDown') {
      layout.activate(paneId);
      // 点画面就是「我要干活了」—— 未钉住时顺手把侧栏让开
      if (!ui.sidePinned && sideHold === 0) {
        clearTimeout(hideSideTimer);
        showSide(false);
      }
      return;
    }
    if (type !== 'mouseMove') return;

    const w = item.el.clientWidth;
    const inZone = y <= BUBBLE_H && Math.abs(x - w / 2) <= Math.max(70, w * BUBBLE_W_RATIO);
    if (inZone) {
      showBubble(paneId);
    } else if (bubblePaneId === paneId && !bubbleHover && !bubbleEditing) {
      hideBubble();
    }
  });
}

// ---------------------------------------------------------------- 二级页：编辑实例

let editingId = null;
let editAutostart = false;

function openEditPage(id) {
  editingId = id || null;
  const it = id ? instById(id) : null;

  const titleKey = it ? 'edit.titleEdit' : 'edit.titleNew';
  dom.editTitle.dataset.key = titleKey;
  dom.editTitle.textContent = t(titleKey);

  $('#fName').value = it ? it.name || '' : '';
  $('#fKind').value = it ? it.target || 'wsl' : 'wsl';
  $('#fHost').value = it ? it.host || '127.0.0.1' : '127.0.0.1';
  $('#fPort').value = it ? it.port || 3080 : 3080;
  $('#fUrl').value = it ? it.url || '' : '';
  $('#fToken').value = it ? it.token || '' : '';
  $('#fDistro').value = it ? it.distro || 'Ubuntu' : 'Ubuntu';
  // 留空 = 用该 WSL 发行版的默认用户（写死用户名在别人机器上必然失效）
  $('#fWslUser').value = it ? it.user || '' : '';
  $('#fUrlFile').value = it ? it.urlFile || '' : '';
  $('#fLauncher').value = it && it.launcher && it.launcher.kind === 'command' ? it.launcher.command : '';
  editAutostart = !!(it && it.autostart);
  $('#swAutostart').classList.toggle('on', editAutostart);

  $('#editDelete').style.display = it ? '' : 'none';
  syncEditVisibility();

  openSidebarPinned();
  dom.pageEdit.classList.add('show');
}

function syncEditVisibility() {
  const kind = $('#fKind').value;
  $('#rowUrl').style.display = kind === 'remote' ? '' : 'none';
  $('#rowToken').style.display = kind === 'remote' ? '' : 'none';
  $('#rowWsl').style.display = kind === 'wsl' ? '' : 'none';
  $('#rowUrlFile').style.display = kind === 'remote' ? 'none' : '';
  $('#rowAutostart').style.display = kind === 'remote' ? 'none' : '';
}

function closeEditPage() {
  dom.pageEdit.classList.remove('show');
  editingId = null;
  holdSide(false);
}

async function saveEditPage() {
  const kind = $('#fKind').value;
  const port = Number($('#fPort').value) || 3080;
  const name = $('#fName').value.trim() || `DSH ${port}`;
  const launcherCmd = $('#fLauncher').value.trim();

  const payload = {
    id: editingId || newId('inst-'),
    name,
    target: kind,
    host: $('#fHost').value.trim() || '127.0.0.1',
    port,
    autostart: editAutostart,
  };

  if (kind === 'remote') {
    payload.url = $('#fUrl').value.trim();
    payload.token = $('#fToken').value.trim();
    if (!payload.url) return toast('URL 不能为空', true);
  } else {
    payload.distro = $('#fDistro').value.trim() || 'Ubuntu';
    payload.user = $('#fWslUser').value.trim();
    payload.urlFile = $('#fUrlFile').value.trim();
    payload.launcher = launcherCmd
      ? { kind: 'command', command: launcherCmd }
      : undefined;
  }

  const r = await api.instances.save(payload);
  instances = r.instances;
  closeEditPage();
  renderInstances();
  probeInstance(payload.id).catch(() => {});
  toast(t('toast.saved'));
}

// ---------------------------------------------------------------- 二级页：安装 DSH

/** 当前选中的 npm 源（"自定义"时取输入框） */
function currentRegistry() {
  const sel = $('#iRegistry');
  if (!sel) return '';
  if (sel.value === '__custom') return $('#iRegistryCustom').value.trim();
  return sel.value.trim();
}

/** 填充版本下拉：先是发行通道，再是具体版本 */
function fillVersionOptions({ tags = {}, versions = [] } = {}) {
  const sel = $('#iVersion');
  sel.innerHTML = '';

  const push = (value, label) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    sel.append(o);
  };

  const names = {
    latest: t('install.chLatest'),
    next: t('install.chNext'),
    alpha: t('install.chAlpha'),
    beta: t('install.chBeta'),
  };
  const order = ['latest', 'next', 'alpha', 'beta'];
  const keys = Object.keys(tags).sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia < 0 ? 90 : ia) - (ib < 0 ? 90 : ib);
  });

  for (const k of keys) push(k, `${names[k] || k} · ${tags[k]}`);
  if (!keys.length) push('latest', t('install.chLatest'));

  if (versions.length) {
    const sep = document.createElement('option');
    sep.disabled = true;
    sep.textContent = '————————';
    sel.append(sep);
    for (const v of versions) push(v, v);
  }
}

/** 从 registry 拉发行通道与版本列表 */
async function loadVersions() {
  const btn = $('#iLoadVer');
  btn.disabled = true;
  setBtnLabel(btn, 'refresh', t('install.loadingVer'));
  try {
    const r = await api.install.versions({
      target: $('#iTarget').value,
      distro: $('#iDistro').value.trim() || 'Ubuntu',
      registry: currentRegistry(),
    });
    if (r.ok) {
      fillVersionOptions(r);
      toast(t('install.verLoaded', { n: (r.versions || []).length }));
    } else {
      toast(r.error || t('install.verFailed'), true);
    }
  } catch (err) {
    toast(String(err.message || err), true);
  } finally {
    btn.disabled = false;
    setBtnLabel(btn, 'refresh', t('install.loadVer'));
  }
}

function openInstallPage() {
  openSidebarPinned();
  dom.pageInstall.classList.add('show');

  if (!$('#iDir').value) {
    $('#iDir').value = $('#iTarget').value === 'wsl'
      ? '~/.local/share/dsh-app'
      : 'C:\\DSH';
  }
  if (!$('#iPort').value) $('#iPort').value = '3080';
  if (!$('#iVersion').options.length) fillVersionOptions();

  $('#iEnv').textContent = '—';
  dom.iLog.textContent = '';
}

function closeInstallPage() {
  dom.pageInstall.classList.remove('show');
  holdSide(false);
}

async function checkInstallEnv() {
  $('#iEnv').textContent = t('install.checking');
  const r = await api.install.check({
    target: $('#iTarget').value,
    distro: $('#iDistro').value.trim() || 'Ubuntu',
    user: '',
  });
  if (r.ok) {
    $('#iEnv').textContent = t('install.envOk', { node: r.node, npm: r.npm });
  } else {
    $('#iEnv').textContent = r.error || '—';
  }
  return r;
}

async function runInstall() {
  const dir = $('#iDir').value.trim();
  if (!dir) return toast(t('install.needDir'), true);

  dom.iLog.textContent = '';
  const btn = $('#iStart');
  btn.disabled = true;
  btn.textContent = t('install.running');

  const port = Number($('#iPort').value) || 3080;
  const opts = {
    target: $('#iTarget').value,
    distro: $('#iDistro').value.trim() || 'Ubuntu',
    user: '',                    // 留空 = 用该发行版的默认用户
    dir,
    registry: currentRegistry(),
    version: $('#iVersion').value || 'latest',
  };

  const r = await api.install.run(opts);

  btn.disabled = false;
  setBtnLabel(btn, 'download', t('install.start'));

  if (r.ok) {
    dom.iLog.textContent += `\n\n${t('install.done')}\n${r.bin}\n`;
    const v = await api.install.verify(opts);
    dom.iLog.textContent += `dsh --version → ${v.output || '(无输出)'}\n`;

    // 顺手建一个指向它的实例（端口用安装页里指定的那个）
    const inst = {
      id: newId('inst-'),
      name: `DSH ${opts.target === 'wsl' ? 'WSL2' : 'Windows'} :${port}`,
      target: opts.target === 'wsl' ? 'wsl' : 'windows',
      distro: opts.distro,
      user: '',
      port,
      host: '127.0.0.1',
      dshBin: v.bin || r.bin,
      autostart: false,
    };
    const saved = await api.instances.save(inst);
    instances = saved.instances;
    renderInstances();
    toast(t('install.created', { name: inst.name }));
  } else {
    dom.iLog.textContent += `\n\n${t('install.failed', { code: r.code ?? '—' })}\n${r.error || ''}\n`;
    toast(t('install.failed', { code: r.code ?? '—' }), true);
  }
  dom.iLog.scrollTop = dom.iLog.scrollHeight;
}

// ---------------------------------------------------------------- 发现

let discCandidates = [];
const discPicked = new Set();
/** 最近一次发现的范围统计（用在界面里说明「我只扫了哪儿」） */
let discScan = null;

async function runDiscover(manual = false) {
  if (manual) toast(t('disc.scanning'));
  const r = await api.discover.run();
  discScan = r.scan || null;
  const found = (r.found || []).filter((c) => !c.already);

  if (!found.length) {
    if (manual) toast(t('disc.none'));
    return;
  }

  discCandidates = found;
  discPicked.clear();
  found.forEach((c) => discPicked.add(c.key));
  syncDiscAddBtn();

  const wheres = [...new Set(found.map((c) => (c.where === 'wsl' ? t('disc.whereWsl') : t('disc.whereLocal'))))];
  dom.discDesc.textContent = t('disc.found', { n: found.length, where: wheres.join(' / ') });

  // 明说扫描范围 —— 扫不到时用户才知道该去哪儿补，而不是以为软件坏了
  if (dom.discScope) {
    const s = discScan || {};
    dom.discScope.textContent = t('disc.scope', {
      dirs: s.dirs || 0,
      ms: s.ms || 0,
      hits: s.hits || 0,
    });
  }

  dom.discList.innerHTML = '';
  // 多个候选时给个「全选」入口 —— 不然得一个个点
  if (found.length > 1) {
    const bar = document.createElement('label');
    bar.className = 'disc-all';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = true;
    const txt = document.createElement('span');
    txt.textContent = t('disc.addAll');
    bar.append(cb, txt);
    cb.addEventListener('change', () => {
      discPicked.clear();
      if (cb.checked) found.forEach((c) => discPicked.add(c.key));
      dom.discList.querySelectorAll('.disc-row').forEach((el) => {
        el.classList.toggle('picked', discPicked.has(el.dataset.key));
      });
      syncDiscAddBtn();
    });
    dom.discList.append(bar);
  }

  for (const c of found) {
    const row = document.createElement('div');
    row.className = 'disc-row picked';
    row.dataset.key = c.key;

    const check = document.createElement('span');
    check.className = 'disc-check';
    check.append(iconEl('check', 11, 'ico'));

    // 运行中 / 已安装未启动，用指示灯区分
    const lamp = document.createElement('span');
    lamp.className = 'lamp';
    lamp.dataset.s = c.running ? 'running' : 'stopped';
    lamp.title = c.running ? t('state.running') : t('state.stopped');

    const main = document.createElement('div');
    main.className = 'disc-main';
    const nm = document.createElement('div');
    nm.className = 'disc-name';
    nm.textContent = c.title;
    const sub = document.createElement('div');
    sub.className = 'disc-sub';
    sub.textContent = c.sub;
    main.append(nm, sub);

    const where = document.createElement('span');
    where.className = 'disc-where';
    where.textContent = c.target === 'wsl' ? 'WSL2' : 'Windows';

    row.append(check, lamp, main, where);
    row.addEventListener('click', () => {
      if (discPicked.has(c.key)) {
        discPicked.delete(c.key);
        row.classList.remove('picked');
      } else {
        discPicked.add(c.key);
        row.classList.add('picked');
      }
      syncDiscAddBtn();
    });
    dom.discList.append(row);
  }

  dom.discover.hidden = false;
  requestAnimationFrame(() => dom.discover.classList.add('show'));
}

/** 「添加选中」按钮上的数量随勾选变化 */
function syncDiscAddBtn() {
  const n = discPicked.size;
  setBtnLabel($('#discAdd'), 'check', n ? `${t('disc.add')} (${n})` : t('disc.add'));
  $('#discAdd').disabled = n === 0;
}

function closeDiscover() {  dom.discover.classList.remove('show');
  setTimeout(() => {
    dom.discover.hidden = true;
  }, 240);
}

async function addDiscovered() {
  const picked = discCandidates.filter((c) => discPicked.has(c.key));
  for (const c of picked) {
    const inst = {
      id: newId('inst-'),
      name: c.running ? c.title : `${c.title} :${c.port || 3080}`,
      target: c.target,
      port: c.port || 3080,
      host: '127.0.0.1',
      dshBin: c.bin || '',
      autostart: false,
    };
    if (c.target === 'wsl') {
      inst.distro = c.distro || 'Ubuntu';
      inst.user = c.user || '';
    }
    const r = await api.instances.save(inst);
    instances = r.instances;
    // 装了没启动的，先标成「未启动」，指示灯就是红的
    setInstState(inst.id, 'stopped');
  }
  closeDiscover();
  renderInstances();
  probeAll();
}

// ---------------------------------------------------------------- 菜单

function openMenu(anchor, items) {
  dom.menu.innerHTML = '';
  for (const it of items) {
    if (it.sep) {
      const s = document.createElement('div');
      s.className = 'menu-sep';
      dom.menu.append(s);
      continue;
    }
    if (it.title) {
      const tt = document.createElement('div');
      tt.className = 'menu-title';
      tt.textContent = it.title;
      dom.menu.append(tt);
      continue;
    }
    const b = document.createElement('button');
    b.className = 'menu-item';
    if (it.icon) b.append(iconEl(it.icon, 14, 'ico'));
    b.append(document.createTextNode(it.label));
    if (it.on) b.classList.add('on');
    b.addEventListener('click', () => {
      closeMenu();
      it.fn();
    });
    dom.menu.append(b);
  }

  dom.menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = dom.menu.offsetWidth;
  const h = dom.menu.offsetHeight;
  let left = r.left;
  let top = r.top - h - 8;
  if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
  if (top < 8) top = r.bottom + 8;
  dom.menu.style.left = Math.max(8, left) + 'px';
  dom.menu.style.top = top + 'px';
}

function closeMenu() {
  dom.menu.hidden = true;
}

// ---------------------------------------------------------------- 工具栏 / 快捷键

function wireToolbar() {
  $('#btnGo').addEventListener('click', applyAddr);
  dom.addrBar.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') applyAddr();
    if (e.key === 'Escape') dom.addrBar.blur();
  });

  $('#btnReload').addEventListener('click', () => {
    if (layout.activeId) reloadPane(layout.activeId);
  });

  $('#btnTile').addEventListener('click', () => layout.tileAll());

  // 新增实例：三个入口都通到这里（标题栏、上侧工具栏、侧栏标题栏）
  $('#btnAddInst').addEventListener('click', () => openEditPage(null));
  $('#btnNewInst').addEventListener('click', () => openEditPage(null));
  $('#btnTitleAdd').addEventListener('click', () => openEditPage(null));

  $('#btnPin').addEventListener('click', () => setTopPinned(!ui.topPinned));

  // 常驻标题栏上的窗口按钮（无边框窗口下用户随时要能关掉它）
  $('#btnWinMin').addEventListener('click', () => api.win.minimize());
  $('#btnWinMax').addEventListener('click', () => api.win.toggleMaximize());
  $('#btnWinClose').addEventListener('click', () => api.win.close());

  // 侧栏底部
  $('#btnDetect').addEventListener('click', () => runDiscover(true));
  $('#btnInstall').addEventListener('click', openInstallPage);
  $('#btnTheme').addEventListener('click', (e) => {
    e.stopPropagation();
    openMenu(e.currentTarget, [
      { title: t('theme.light') + ' / ' + t('theme.dark'), fn: () => {} },
      { label: t('theme.light'), icon: 'sun', on: ui.theme === 'light', fn: () => applyTheme('light') },
      { label: t('theme.dark'), icon: 'moon', on: ui.theme === 'dark', fn: () => applyTheme('dark') },
      { label: t('theme.auto'), icon: 'auto', on: ui.theme === 'auto', fn: () => applyTheme('auto') },
    ]);
  });
  $('#btnLang').addEventListener('click', (e) => {
    e.stopPropagation();
    openMenu(e.currentTarget, [
      { title: t('lang.zh') + ' / ' + t('lang.en'), fn: () => {} },
      { label: t('lang.zh'), icon: 'globe', on: ui.lang === 'zh', fn: () => applyLang('zh') },
      { label: t('lang.en'), icon: 'globe', on: ui.lang === 'en', fn: () => applyLang('en') },
    ]);
  });
  // 「关于」并入版本号：底部只留主题和语言两个按钮，信息点版本号看
  $('#verLabel').addEventListener('click', (e) => {
    e.stopPropagation();
    const info = appInfo || {};
    openMenu(e.currentTarget, [
      { title: `DSH Multi-Instance v${info.version || ''}` },
      { label: `Electron ${info.electron || ''}`, icon: 'shield', fn: () => {} },
      { label: `Chrome ${info.chrome || ''}`, icon: 'api', fn: () => {} },
      { label: t('side.settings'), icon: 'folder', fn: () => toast(info.userData || '') },
    ]);
  });

  // 发现弹窗
  $('#discIgnore').addEventListener('click', closeDiscover);
  $('#discAdd').addEventListener('click', addDiscovered);
  $('#discIcon').append(iconEl('instances', 14, 'ico'));

  document.addEventListener('click', () => closeMenu());

  // 编辑页
  $('#editClose').addEventListener('click', closeEditPage);
  $('#editSave').addEventListener('click', saveEditPage);
  $('#editTest').addEventListener('click', async () => {
    if (!editingId) return toast(t('toast.saved'));
    await probeInstance(editingId, false);
  });
  $('#editDelete').addEventListener('click', async () => {
    if (editingId) {
      closeEditPage();
      await removeInstance(editingId);
    }
  });
  $('#fKind').addEventListener('change', syncEditVisibility);
  $('#rowAutostart').addEventListener('click', () => {
    editAutostart = !editAutostart;
    $('#swAutostart').classList.toggle('on', editAutostart);
  });

  // 安装页
  $('#installClose').addEventListener('click', closeInstallPage);
  $('#iCheck').addEventListener('click', checkInstallEnv);
  $('#iStart').addEventListener('click', runInstall);
  $('#iLoadVer').addEventListener('click', loadVersions);
  $('#iRegistry').addEventListener('change', () => {
    const custom = $('#iRegistry').value === '__custom';
    $('#iRegistryCustom').hidden = !custom;
    if (custom) $('#iRegistryCustom').focus();
  });
  $('#iTarget').addEventListener('change', () => {
    $('#rowIDistro').style.display = $('#iTarget').value === 'wsl' ? '' : 'none';
    // WSL 里用 ~ 开头 —— installer 会把它换成 $HOME，跟着实际用户走
    $('#iDir').value = $('#iTarget').value === 'wsl'
      ? '~/.local/share/dsh-app'
      : 'C:\\DSH';
  });
  $('#iPick').addEventListener('click', async () => {
    if ($('#iTarget').value === 'wsl') {
      return toast('WSL 目录请直接输入路径');
    }
    const r = await api.pickDir({ title: t('install.dir') });
    if (r.ok) $('#iDir').value = r.dir;
  });
}

function applyAddr() {
  const url = dom.addrBar.value.trim();
  if (!/^https?:\/\//i.test(url)) return toast('http:// 或 https:// 开头', true);
  const item = layout.get(layout.activeId);
  if (!item) return toast(t('empty.title'), true);
  item.model.url = url;
  mountWebview(item);
}

function wireHotkeys() {
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) {
      if (e.key === 'Escape') {
        if (layout.zoneMode) return layout.exitZones();
        closeMenu();
        closeDiscover();
        closeEditPage();
        closeInstallPage();
        if (!ui.sidePinned) showSide(false);
        if (!ui.topPinned) showTop(false);
      }
      return;
    }
    const k = e.key.toLowerCase();
    if (e.shiftKey && k === 't') {
      e.preventDefault();
      setTopPinned(!ui.topPinned);
    } else if (e.shiftKey && k === 'b') {
      e.preventDefault();
      toggleSide();
    } else if (k === 'n' && !e.shiftKey) {
      e.preventDefault();
      openSidebarPinned();
    } else if (k === 'r' && !e.shiftKey) {
      e.preventDefault();
      if (layout.activeId) reloadPane(layout.activeId);
    } else if (k === 'w' && !e.shiftKey) {
      e.preventDefault();
      if (layout.activeId) unmountPane(layout.activeId);
    }
  });
}

// ---------------------------------------------------------------- 启动

function wireEvents() {
  api.onInstanceUrl((p) => dispatchWaiter('instance:url', p));
  api.onInstanceLog(({ text }) => {
    // 启动输出只写日志，避免刷屏
    if (text && text.trim()) api.log('[instance] ' + text.trim().slice(0, 200));
  });
  api.onHotkey((key) => window.dispatchEvent(new CustomEvent('dsh-hotkey', { detail: key })));
  api.onOpenRequest((url) => toast('拦截到弹窗：' + url));
  api.onInstallLog((text) => {
    dom.iLog.textContent += text;
    dom.iLog.scrollTop = dom.iLog.scrollHeight;
  });
}

window.addEventListener('dsh-hotkey', (e) => {
  const k = e.detail;
  if (k === 'toggle-top') setTopPinned(!ui.topPinned);
  if (k === 'toggle-side') toggleSide();
  if (k === 'reload' && layout.activeId) reloadPane(layout.activeId);
  if (k === 'hide-pane' && layout.activeId) unmountPane(layout.activeId);
  if (k === 'new-pane') openSidebarPinned();
});

/** 演示/取证模式：打开可用的本机实例，展开两侧抽屉，并把气泡亮出来 */
async function runDemo() {
  // 拍干净截图用：把实例临时指向指定地址（比如一个全新 DSH_HOME 的空实例），
  // 这样画面上不会出现真实会话内容。不落盘。
  if (appInfo.demoUrl) {
    const n = Number(appInfo.demoUrlCount) || 1;
    for (let i = 0; i < n; i += 1) {
      instances.push({
        id: `demo-${i}`,
        name: `DSH ${i + 1}`,
        target: 'remote',
        url: appInfo.demoUrl,
        port: 0,
        host: '127.0.0.1',
        autostart: false,
        demo: true,
      });
    }
  }

  const usable = instances.filter((x) => x.target !== 'remote').slice(0, 2);
  for (const it of usable) {
    await openInstance(it.id);
  }
  if (appInfo.demoUrl) {
    const demoList = instances.filter((x) => x.demo);
    for (const it of demoList) await openInstance(it.id);
  }
  const list = layout.list();
  if (list.length === 1) list[0] && layout.setRect(list[0].model.id, { x: 0, y: 0, w: 1, h: 1 });
  if (list[1]) layout.setRect(list[1].model.id, { x: 0.62, y: 0, w: 0.38, h: 0.56 }, { animate: false });

  setTopPinned(true);
  setSidePinned(true);

  setTimeout(() => {
    const first = layout.list()[0];
    if (first) {
      showBubble(first.model.id, true);
      const b = dom.bubble;
      api.log(
        `demo: bubble class="${b.className}" style=${b.style.left},${b.style.top} ` +
          `rect=${JSON.stringify(b.getBoundingClientRect())}`
      );
    }
    const parts = layout.list().map((it) => {
      const r = it.el.getBoundingClientRect();
      return `${it.model.id}[${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}]`;
    });
    api.log(`demo: ${parts.join(' ')}`);
  }, 2500);

  if (appInfo.demoZone && layout.list()[0]) {
    setTimeout(() => {
      // 只做展示，避免演示期间被误点掉
      dom.zones.classList.add('preview');
      enterZone(Number(appInfo.demoZone));
      api.log(`demo: 进入 ${appInfo.demoZone} 分区模式（预览）`);
    }, 3600);
  }

  if (appInfo.demoPage) {
    setTimeout(() => {
      if (appInfo.demoPage === 'install') openInstallPage();
      else openEditPage(instances[0] && instances[0].id);
      api.log(`demo: 打开二级页 ${appInfo.demoPage}`);
    }, 3200);
  }
}

async function boot() {
  appInfo = await api.info();
  dom.verLabel.textContent = `v${appInfo.version}`;

  const [list, state] = await Promise.all([api.instances.list(), api.state.load()]);
  instances = list;
  ui = Object.assign({ theme: 'light', lang: 'zh', topPinned: false, sidePinned: false }, state.ui || {});
  collapsed = new Set(state.collapsed || []);

  setLang(ui.lang);
  applyTheme(ui.theme);

  layout = new LayoutEngine.Layout({
    stage: dom.stage,
    guides: dom.guides,
    shield: dom.shield,
    zoneLayer: dom.zones,
    onChanged: () => savePanes(),
    // 平铺后格子小到没法用时提示一声（实测 12 个开始勉强、20 个以上不可用）
    onCramped: ({ w, h }) => {
      if (w < 300 || h < 220) toast(t('toast.resizeHint'), true);
      else if (w < 420 || h < 300) toast(t('toast.resizeHint'));
    },
    onActivate: () => {
      syncAddr();
      renderInstances();
    },
    onCollapse: (ids) => {
      for (const paneId of ids) unmountPane(paneId, { silent: true });
      toast(t('zone.collapsed', { n: ids.length }));
      renderInstances();
    },
  });

  wireDrawers();
  wireToolbar();
  wireBubble();
  wireZones();
  wireHotkeys();
  wireEvents();
  wireWebviewMouse();

  initButtons();
  refreshAllLabels();

  // 经典的窗口按钮行为：最大化之后要变成「向下还原」
  api.win.onMaximized((isMax) => {
    const name = isMax ? 'restore' : 'fullscreen';
    setBtnLabel($('#btnWinMax'), name, '', 11);
    const tip = isMax ? t('win.restore') : t('win.maximize');
    $('#btnWinMax').setAttribute('data-tip', tip);
  });

  // 恢复上次的窗格
  if (Array.isArray(state.panes) && state.panes.length) {
    for (const p of state.panes) {
      const inst = instById(p.instanceId);
      if (!inst) continue;
      if (collapsed.has(p.instanceId)) continue;
      const r = await api.instance.resolve(p.instanceId);
      const item = layout.create({ ...p, title: inst.name || p.title, url: r.ok ? r.url : p.url });
      mountWebview(item);
    }
  }

  if (ui.topPinned) showTop(true);
  $('#btnSidePin').classList.toggle('on', ui.sidePinned);
  if (ui.sidePinned) showSide(true);

  renderInstances();
  refreshEmpty();
  api.log('renderer boot done');

  // 供自动化取证使用（--selftest / 截图脚本）
  window.__dsh = {
    get layout() {
      return layout;
    },
    instances: () => instances,
    openInstance: (id) => openInstance(id || (instances[0] && instances[0].id)),
    bubbleShown: () => dom.bubble.classList.contains('show'),
    zoneShown: () => !dom.zones.hidden,
    setRect: (x, y, w, h) => {
      const first = layout.list()[0];
      if (first) layout.setRect(first.model.id, { x, y, w, h });
    },
    // 拍照/演示用：切语言、开关抽屉（避免截图里露出地址栏里的 token）
    setLang: (l) => applyLang(l),
    setTheme: (p) => applyTheme(p),
    showTop: (on) => showTop(on),
    showSide: (on) => showSide(on),
    pinTop: (on) => setTopPinned(on),
    pinSide: (on) => setSidePinned(on),

    /**
     * 点掉 dsh 首次启动的引导弹窗（同意页 → API key 页 → …）。
     * 它们渲染在 webview 内部（独立进程），宿主拿不到 DOM —— 只能把 JS 投递进去。
     * 反复点几次，把这一串引导都过掉；返回每次点到了什么，便于排查。
     *
     * @param {number} rounds 最多点几次
     * @param {string} [paneId] 指定窗格；不给就所有窗格都点一遍
     */
    dismissNotice: async (rounds = 4, paneId) => {
      const targets = paneId
        ? [[paneId, wcIdByPane.get(paneId)]]
        : [...wcIdByPane.entries()];
      if (!targets.length) return 'no-webview';

      const code = `(() => {
        const all = [...document.querySelectorAll('button, [role="button"], a')];
        // 按优先级找「跳过/稍后」类按钮，避免误点「保存」把空 key 提交上去
        const order = [
          /^(configure later|set up later|skip|not now|later|maybe later)$/i,
          /^(continue|got it|i agree|ok|agree|continue\\s*→)$/i,
        ];
        for (const re of order) {
          const hit = all.find(el => re.test((el.textContent || '').trim()));
          if (hit) { hit.click(); return 'clicked:' + hit.textContent.trim(); }
        }
        return 'done';
      })()`;

      const out = [];
      for (const [pid, wcId] of targets) {
        if (!wcId) continue;
        for (let i = 0; i < rounds; i += 1) {
          const r = await api.webviewExec(wcId, code);
          const res = r && r.ok ? String(r.result) : 'fail:' + (r && r.error);
          out.push(`${pid}:${res}`);
          if (res === 'done') break;
          await new Promise((s) => setTimeout(s, 1100));
        }
      }
      const summary = out.join(' | ');
      api.log('dismissNotice → ' + summary);
      return summary;
    },
  };

  // 先点亮指示灯，再自动发现
  probeAll();

  setTimeout(async () => {
    // 随软件启动的实例
    for (const it of instances) {
      if (it.autostart && !findPaneByInstance(it.id) && !collapsed.has(it.id)) {
        openInstance(it.id);
      }
    }

    // 首次启动（没有任何历史排布）时，直接把第一个本机实例打开，不留空壳
    const hadPanes = Array.isArray(state.panes) && state.panes.length > 0;
    if (!hadPanes && !layout.list().length) {
      const firstLocal = instances.find((x) => x.target !== 'remote');
      if (firstLocal) await openInstance(firstLocal.id);
    }

    // 截图/演示时可以关掉 —— 弹窗会盖住画面，也会把本机路径露出来
    if (!appInfo.noDiscover) await runDiscover(false);
  }, 900);

  if (appInfo.demo) await runDemo();
}

boot().catch((err) => {
  toast('启动出错：' + err.message, true);
  api.log('boot error: ' + (err && err.stack));
});
