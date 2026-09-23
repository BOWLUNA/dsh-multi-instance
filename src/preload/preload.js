'use strict';

/**
 * 预加载脚本 —— 渲染层与主进程之间唯一的桥。
 * 只暴露白名单方法，不泄漏 ipcRenderer 本身。
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('shell', {
  info: () => ipcRenderer.invoke('app:info'),

  instances: {
    list: () => ipcRenderer.invoke('instances:list'),
    save: (payload) => ipcRenderer.invoke('instances:save', payload),
    remove: (id) => ipcRenderer.invoke('instances:remove', id),
    reset: () => ipcRenderer.invoke('instances:reset'),
  },

  instance: {
    resolve: (id) => ipcRenderer.invoke('instance:resolve', id),
    probe: (id) => ipcRenderer.invoke('instance:probe', id),
    start: (id) => ipcRenderer.invoke('instance:start', id),
    stop: (id) => ipcRenderer.invoke('instance:stop', id),
  },

  discover: {
    run: () => ipcRenderer.invoke('discover:run'),
  },

  install: {
    check: (opts) => ipcRenderer.invoke('install:check', opts),
    run: (opts) => ipcRenderer.invoke('install:run', opts),
    verify: (opts) => ipcRenderer.invoke('install:verify', opts),
    versions: (opts) => ipcRenderer.invoke('install:versions', opts),
  },

  pickDir: (opts) => ipcRenderer.invoke('pickDir', opts),
  openExternal: (url) => ipcRenderer.invoke('dsh:openExternal', url),
  /** 在某个 webview 内部跑 JS（仅自动化取证；需要 --eval / --shot 才开放） */
  webviewExec: (wcId, code) => ipcRenderer.invoke('webview:exec', wcId, code),

  state: {
    load: () => ipcRenderer.invoke('state:load'),
    save: (state) => ipcRenderer.invoke('state:save', state),
  },

  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    toggleMaximize: () => ipcRenderer.send('win:toggleMaximize'),
    close: () => ipcRenderer.send('win:close'),
    onMaximized: (cb) => ipcRenderer.on('win:maximized', (_e, v) => cb(!!v)),
  },

  // 主题同步：让 webview 里的页面（DSH 设成「跟随系统」时）跟着壳一起变色
  theme: {
    set: (pref) => ipcRenderer.send('theme:set', String(pref || 'auto')),
  },

  log: (msg) => ipcRenderer.send('log:write', String(msg)),

  onHotkey: (cb) => ipcRenderer.on('shell:hotkey', (_e, key) => cb(key)),
  onOpenRequest: (cb) => ipcRenderer.on('shell:open-request', (_e, url) => cb(url)),
  onWebviewMouse: (cb) => ipcRenderer.on('webview:mouse', (_e, payload) => cb(payload)),
  onInstanceLog: (cb) => ipcRenderer.on('instance:log', (_e, payload) => cb(payload)),
  onInstanceUrl: (cb) => ipcRenderer.on('instance:url', (_e, payload) => cb(payload)),
  onInstallLog: (cb) => ipcRenderer.on('install:log', (_e, text) => cb(text)),
});
