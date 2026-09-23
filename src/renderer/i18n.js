'use strict';

/**
 * 中英文文案。
 * 用法：t('key') 取文案；applyI18n(root) 把带 data-i18n 的节点刷一遍。
 */
const I18N = {
  zh: {
    'app.name': 'DSH 套壳',
    'app.subtitle': '多实例工作台',

    // 侧栏
    'side.instances': 'DeepSeek Harness 列表',
    'side.onCanvas': '画布',
    'side.collapsed': '已收起',
    'side.add': '新增实例',
    'side.empty': '还没有实例',
    'side.emptyHint': '手动加一个，或者让软件扫一遍本机',
    'side.btnAdd': '增加实例',
    'side.btnSearch': '搜索实例',
    'side.btnDownload': '下载实例',
    'side.detect': '检测本机实例',
    'side.settings': '设置',
    'side.openCanvas': '回到画布',
    'side.stopProcess': '关闭实例进程',
    'side.edit': '编辑',
    'side.remove': '移除',
    'side.starting': '启动中…',

    // 二级设置页
    'edit.titleNew': '新增 DSH 实例',
    'edit.titleEdit': '编辑 DSH 实例',
    'edit.name': '名称',
    'edit.namePh': '给它起个好认的名字',
    'edit.kind': '接入方式',
    'edit.kindLocal': '本机（自动读访问地址）',
    'edit.kindRemote': '远程（手填地址）',
    'edit.host': '主机',
    'edit.port': '端口',
    'edit.token': 'Token',
    'edit.tokenPh': '远程实例必填',
    'edit.urlFile': '地址文件',
    'edit.launcher': '启动命令（选填）',
    'edit.launcherHint': '本机实例：服务没跑时用这条命令把它拉起来',
    'edit.autostart': '随软件启动',
    'edit.autostartHint': '打开软件时自动启动这个实例',
    'edit.save': '保存',
    'edit.cancel': '取消',
    'edit.test': '测试连接',
    'edit.portHint': '改端口后会自动重建访问地址',

    // 气泡
    'bubble.renameHint': '点击改名',
    'bubble.minimize': '最小化',
    'bubble.fullscreen': '铺满画布',
    'bubble.zone2': '二分之一分区',
    'bubble.zone3': '三分之一分区',
    'bubble.zone4': '四分之一分区',
    'bubble.reload': '重新加载',
    'bubble.external': '用浏览器打开',

    // 分区
    'zone.hint': '选择要放置的分区',
    'zone.cancel': '按 Esc 取消',
    'zone.collapsed': '已收起 {n} 个实例，可从左侧栏恢复',

    // 发现
    'disc.title': '发现 DSH 实例',
    'disc.found': '在{where}检测到 {n} 个 DSH 服务，要添加吗？',
    'disc.whereLocal': '本机',
    'disc.whereWsl': 'WSL2',
    'disc.add': '添加选中',
    'disc.addAll': '全部添加',
    'disc.ignore': '不用了',
    'disc.none': '常见位置没找到新的 DSH —— 不会翻全盘（尊重隐私），也可以用「增加实例」手动加',
    'disc.scope': '扫描范围：PATH、npm 全局目录、你的用户目录（4 层内）、各盘根（2 层内）—— 本次走过 {dirs} 个目录 / {ms}ms，撞名 {hits} 个。之所以不翻全盘，是为了不读到你的私人文件。',
    'disc.scanning': '正在检测…',
    'disc.alreadyAdded': '已添加',

    // 安装 DSH
    'install.title': '安装 DSH',
    'install.notice': '本软件不捆绑 DSH，也不会在后台自动下载。只有你点「开始安装」时，才会往下面的位置执行一次 npm 安装。',
    'install.target': '安装到',
    'install.targetWsl': 'WSL2 发行版',
    'install.targetWin': 'Windows 本机',
    'install.distro': '发行版名称',
    'install.dir': '安装目录',
    'install.pick': '选择',
    'install.version': '版本',
    'install.chLatest': '最新正式版',
    'install.chNext': '预览版',
    'install.chAlpha': '内测版',
    'install.chBeta': '测试版',
    'install.loadVer': '拉取',
    'install.loadingVer': '拉取中…',
    'install.verLoaded': '已获取 {n} 个可用版本',
    'install.verFailed': '拉不到版本列表（检查网络或换个源）',
    'install.port': '端口',
    'install.portHint': '安装完成后创建的实例会用这个端口',
    'install.regOfficial': 'npm 官方源',
    'install.regHuawei': '华为云镜像',
    'install.regTaobao': '淘宝镜像 npmmirror',
    'install.regTencent': '腾讯云镜像',
    'install.regCustom': '自定义…',
    'install.registryHint': '装得慢或者装不上，就换个近的源',
    'install.registry': 'npm 源',
    'install.env': '环境检查',
    'install.progress': '安装输出',
    'install.start': '开始安装',
    'install.check': '检查环境',
    'install.checking': '正在检查…',
    'install.running': '正在安装…',
    'install.done': '安装完成',
    'install.failed': '安装失败（退出码 {code}）',
    'install.needDir': '请先选好安装目录',
    'install.created': '已创建实例「{name}」',
    'install.envOk': 'node {node} · npm {npm}',
    'install.dirHint': '建议用空目录，避免和其他东西混在一起',

    // 状态
    'state.running': '已启动',
    'state.stopped': '未启动',
    'state.starting': '启动中',
    'state.needToken': '需要 token',
    'state.error': '异常',
    'state.checking': '检测中',

    // 通用
    'ok': '好',
    'cancel': '取消',
    'close': '关闭',
    'save': '保存',
    'delete': '删除',
    'confirm': '确定',
    'loading': '处理中…',

    // 工具栏
    'topbar.tile': '平铺全部窗格',
    'topbar.sidebar': '显示 / 隐藏侧栏',
    'topbar.sideClose': '收起侧栏',
    'topbar.sidePin': '钉住侧栏',
    'topbar.pin': '固定工具栏',
    'win.minimize': '最小化',
    'win.maximize': '最大化',
    'win.restore': '向下还原',

    // 主题 / 语言
    'theme.light': '浅色',
    'theme.dark': '深色',
    'theme.auto': '跟随系统',
    'lang.zh': '中文',
    'lang.en': 'English',

    // 提示
    'toast.started': '「{name}」已启动',
    'toast.startFailed': '「{name}」启动失败：{err}',
    'toast.copied': '已复制',
    'toast.noUrl': '拿不到访问地址',
    'toast.renamed': '已改名',
    'toast.saved': '已保存',
    'toast.removed': '已移除「{name}」',
    'toast.stopped': '已关闭「{name}」的进程',
    'toast.online': '在线（HTTP {code}）',
    'toast.needToken': '服务在，但需要 token',
    'toast.offline': '连不上：{err}',
    'toast.resizeHint': '画布放不下了，建议收起一些实例',

    // 空状态
    'empty.title': '画布是空的',
    'empty.sub': '从左侧点一个实例，它就会出现在这里',
  },

  en: {
    'app.name': 'DSH Shell',
    'app.subtitle': 'Multi-instance workbench',

    'side.instances': 'DeepSeek Harness List',
    'side.onCanvas': 'on canvas',
    'side.collapsed': 'hidden',
    'side.add': 'New instance',
    'side.empty': 'No instances yet',
    'side.emptyHint': 'Add one by hand, or scan this machine',
    'side.btnAdd': 'Add',
    'side.btnSearch': 'Detect',
    'side.btnDownload': 'Install',
    'side.detect': 'Detect on this machine',
    'side.settings': 'Settings',
    'side.openCanvas': 'Show on canvas',
    'side.stopProcess': 'Stop instance process',
    'side.edit': 'Edit',
    'side.remove': 'Remove',
    'side.starting': 'Starting…',

    'edit.titleNew': 'New DSH instance',
    'edit.titleEdit': 'Edit DSH instance',
    'edit.name': 'Name',
    'edit.namePh': 'Give it a recognizable name',
    'edit.kind': 'Connection',
    'edit.kindLocal': 'Local (read address automatically)',
    'edit.kindRemote': 'Remote (enter address)',
    'edit.host': 'Host',
    'edit.port': 'Port',
    'edit.token': 'Token',
    'edit.tokenPh': 'Required for remote instances',
    'edit.urlFile': 'Address file',
    'edit.launcher': 'Launcher command (optional)',
    'edit.launcherHint': 'For local: command used to bring the service up',
    'edit.autostart': 'Launch with app',
    'edit.autostartHint': 'Start this instance when the app opens',
    'edit.save': 'Save',
    'edit.cancel': 'Cancel',
    'edit.test': 'Test connection',
    'edit.portHint': 'Changing the port rebuilds the access URL',

    'bubble.renameHint': 'Click to rename',
    'bubble.minimize': 'Minimize',
    'bubble.fullscreen': 'Fill canvas',
    'bubble.zone2': 'Half zones',
    'bubble.zone3': 'Third zones',
    'bubble.zone4': 'Quarter zones',
    'bubble.reload': 'Reload',
    'bubble.external': 'Open in browser',

    'zone.hint': 'Pick a zone',
    'zone.cancel': 'Esc to cancel',
    'zone.collapsed': '{n} instance(s) hidden — restore from the sidebar',

    'disc.title': 'DSH instances found',
    'disc.found': 'Found {n} DSH service(s) via {where}. Add them?',
    'disc.whereLocal': 'local host',
    'disc.whereWsl': 'WSL2',
    'disc.add': 'Add selected',
    'disc.addAll': 'Add all',
    'disc.ignore': 'Not now',
    'disc.none': 'Nothing new in the usual places — it does not deep-scan your disk (privacy). You can also add one by hand.',
    'disc.scope': 'Searched: PATH, the npm global dir, your home folder (4 levels), each drive root (2 levels) — {dirs} directories in {ms}ms, {hits} name matches. Your whole disk is deliberately left alone so private files are never read.',
    'disc.scanning': 'Scanning…',
    'disc.alreadyAdded': 'Added',

    // Install DSH
    'install.title': 'Install DSH',
    'install.notice': 'This app does not bundle DSH and never downloads it in the background. Only pressing "Start install" runs an npm install into the location below.',
    'install.target': 'Install into',
    'install.targetWsl': 'WSL2 distro',
    'install.targetWin': 'Windows host',
    'install.distro': 'Distro name',
    'install.dir': 'Install directory',
    'install.pick': 'Browse',
    'install.version': 'Version',
    'install.chLatest': 'Latest stable',
    'install.chNext': 'Next',
    'install.chAlpha': 'Alpha',
    'install.chBeta': 'Beta',
    'install.loadVer': 'Fetch',
    'install.loadingVer': 'Fetching…',
    'install.verLoaded': '{n} versions available',
    'install.verFailed': 'Could not fetch versions (check network or switch mirror)',
    'install.port': 'Port',
    'install.portHint': 'The instance created after install will use this port',
    'install.regOfficial': 'npm official',
    'install.regHuawei': 'Huawei Cloud mirror',
    'install.regTaobao': 'npmmirror (Taobao)',
    'install.regTencent': 'Tencent Cloud mirror',
    'install.regCustom': 'Custom…',
    'install.registryHint': 'Switch to a closer mirror if it is slow or fails',
    'install.registry': 'npm registry',
    'install.env': 'Environment',
    'install.progress': 'Output',
    'install.start': 'Start install',
    'install.check': 'Check environment',
    'install.checking': 'Checking…',
    'install.running': 'Installing…',
    'install.done': 'Install finished',
    'install.failed': 'Install failed (exit {code})',
    'install.needDir': 'Pick an install directory first',
    'install.created': 'Instance "{name}" created',
    'install.envOk': 'node {node} · npm {npm}',
    'install.dirHint': 'An empty directory is recommended',

    'state.running': 'Running',
    'state.stopped': 'Stopped',
    'state.starting': 'Starting',
    'state.needToken': 'Token needed',
    'state.error': 'Error',
    'state.checking': 'Checking',

    'ok': 'OK',
    'cancel': 'Cancel',
    'close': 'Close',
    'save': 'Save',
    'delete': 'Delete',
    'confirm': 'Confirm',
    'loading': 'Working…',

    // Toolbar
    'topbar.tile': 'Tile all panes',
    'topbar.sidebar': 'Show / hide sidebar',
    'topbar.sideClose': 'Collapse sidebar',
    'topbar.sidePin': 'Pin sidebar',
    'topbar.pin': 'Pin toolbar',
    'win.minimize': 'Minimize',
    'win.maximize': 'Maximize',
    'win.restore': 'Restore',

    'theme.light': 'Light',
    'theme.dark': 'Dark',
    'theme.auto': 'System',
    'lang.zh': '中文',
    'lang.en': 'English',

    'toast.started': '"{name}" started',
    'toast.startFailed': '"{name}" failed: {err}',
    'toast.copied': 'Copied',
    'toast.noUrl': 'No access URL',
    'toast.renamed': 'Renamed',
    'toast.saved': 'Saved',
    'toast.removed': 'Removed "{name}"',
    'toast.stopped': 'Stopped "{name}"',
    'toast.online': 'Online (HTTP {code})',
    'toast.needToken': 'Service up, token required',
    'toast.offline': 'Unreachable: {err}',
    'toast.resizeHint': 'Canvas is full — consider hiding some instances',

    'empty.title': 'Canvas is empty',
    'empty.sub': 'Pick an instance on the left to show it here',
  },
};

let currentLang = 'zh';

function setLang(lang) {
  currentLang = I18N[lang] ? lang : 'zh';
  document.documentElement.setAttribute('lang', currentLang === 'zh' ? 'zh-CN' : 'en');
  applyI18n(document);
  return currentLang;
}

function getLang() {
  return currentLang;
}

/** t('toast.started', { name: '本机 DSH' }) */
function t(key, vars) {
  const dict = I18N[currentLang] || I18N.zh;
  let s = dict[key];
  if (s === undefined) s = I18N.zh[key];
  if (s === undefined) return key;
  if (vars) {
    for (const k of Object.keys(vars)) {
      s = s.split('{' + k + '}').join(String(vars[k]));
    }
  }
  return s;
}

function applyI18n(root) {
  const scope = root || document;
  scope.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  scope.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
  });
  scope.querySelectorAll('[data-i18n-title]').forEach((el) => {
    const key = el.getAttribute('data-i18n-title');
    el.setAttribute('data-tip', t(key));
  });
}

window.I18N = I18N;
window.t = t;
window.setLang = setLang;
window.getLang = getLang;
window.applyI18n = applyI18n;
