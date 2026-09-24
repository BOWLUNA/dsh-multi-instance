#!/usr/bin/env node
'use strict';

/**
 * npm 包的可执行入口。
 *
 * 这是个 Electron 桌面应用，不是命令行工具 —— 这个 bin 的作用是：
 * 找到 Electron 运行时，用它把应用拉起来。
 *
 * 注意：`electron` 在 package.json 里是 devDependency，npm 全局安装时不会装它。
 * 所以这里要按顺序找：
 *   1. 本包 node_modules 里的 electron（开发 / 本地安装时）
 *   2. 上一级 node_modules 里的 electron（npm link 之类的布局）
 *   3. 全局 node_modules 里的 electron（`npm i -g electron` 之后）
 * 都找不到就给出明确指引，而不是抛一堆栈。
 *
 * ★ 「找到了」和「能用」是两件事：`require('electron')` 返回的是**路径字符串**，
 *   而那个文件可能因为 postinstall 没跑完而不存在。所以必须 `existsSync` 才算命中 ——
 *   否则会把「Electron 装了但二进制缺失」报成一句看不懂的 spawn ENOENT。
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const APP_ROOT = path.resolve(__dirname, '..');
const DOWNLOAD_HINT = 'https://github.com/BOWLUNA/dsh-multi-instance/releases';

/** 包版本。取不到也不该崩 —— 一个 `-v` 不值得抛异常。 */
let VERSION = '0.0.0';
try {
  // eslint-disable-next-line import/no-dynamic-require
  VERSION = require(path.join(APP_ROOT, 'package.json')).version || VERSION;
} catch {
  /* 保持 0.0.0 */
}

/**
 * 先解析自己的参数，剩下的原样透传给 Electron。
 *
 * ★ 这一步必须在「找 Electron」**之前**：`dsh-multi-instance --version` 是用户装完包后的
 *   第一个动作，如果那时（还没装 Electron）它报的是「找不到 Electron 运行时」，
 *   用户会以为包本身坏了。
 * ★ `--` 之后的内容一律透传，不再当选项解析。
 */
const HELP_FLAGS = new Set(['-h', '--help', 'help']);
const VERSION_FLAGS = new Set(['-v', '-V', '--version']);

function parseArgs(argv = []) {
  const out = { action: 'run', passthrough: [] };
  let literal = false;
  for (const arg of argv) {
    if (!literal) {
      if (arg === '--') {
        literal = true;
        continue;
      }
      if (HELP_FLAGS.has(arg)) {
        out.action = 'help';
        continue;
      }
      if (VERSION_FLAGS.has(arg)) {
        out.action = 'version';
        continue;
      }
    }
    out.passthrough.push(arg);
  }
  return out;
}

/** 给 `--version`：一行版本，外加两个会让「双击没反应」的运行时版本。 */
function versionText() {
  return `dsh-multi-instance ${VERSION}\n`;
}

function helpText() {
  return [
    '',
    `dsh-multi-instance ${VERSION} —— 把 dsh web 装进桌面窗口的多实例壳`,
    '',
    '用法：',
    '    dsh-multi-instance [选项]        启动桌面窗口（选项会透传给应用）',
    '    dsh-multi-instance --version     只看版本',
    '    dsh-multi-instance --help        看这页',
    '',
    '常用选项：',
    '    --demo                     展开侧栏并打开一个实例',
    '    --demo-zone=4              展示 1/4 分区光晕（2 / 3 / 4）',
    '    --demo-page=install        启动后直接打开某个页面',
    '    --no-discover              不做启动时的自动发现',
    '    --devtools                 打开开发者工具',
    '    --verbose                  把日志同时打到终端',
    '',
    '自检 / 采样（需要图形界面）：',
    '    --selftest                 合成鼠标事件验证「划出气泡 → 拖动」',
    '    --selftest-side            验证侧栏的三条收起路径',
    '    --selftest-win             验证常驻标题栏给画布让出了空间',
    '    --selftest-tip             检查悬停提示会不会被裁掉',
    '    --memtest                  全部打开后统计进程数与内存',
    '    --eval="<js>"              加载后在渲染层跑一段 JS',
    '    --shot=<路径> --shot-delay=<毫秒> --shot-exit',
    '                               自动截图后退出',
    '',
    '这个包需要 Electron 运行时：`npm i -g electron`。',
    '不想装依赖的话，直接用免安装版：',
    `    ${DOWNLOAD_HINT}`,
    '',
    `文档：${DOWNLOAD_HINT.replace('/releases', '#安装')}`,
    '',
  ].join('\n');
}

/** 依次尝试的模块说明符。 */
function candidateSpecs(appRoot = APP_ROOT) {
  return [
    path.join(appRoot, 'node_modules', 'electron'),
    path.join(appRoot, '..', 'electron'),
    'electron',
  ];
}

/**
 * 找出可用的 Electron 二进制。
 * @returns {{path:string, spec:string|null, exists:boolean}|null}
 *   null = 连 electron 模块都没装上；exists=false = 模块在、但二进制文件不在。
 */
function resolveElectron(opts = {}) {
  const appRoot = opts.appRoot || APP_ROOT;
  const fsImpl = opts.fsImpl || fs;
  const requireFn = opts.require || require;
  let lastPath = null;
  for (const spec of candidateSpecs(appRoot)) {
    let mod;
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      mod = requireFn(spec);
    } catch {
      continue; // 这个位置没有，试下一个
    }
    if (typeof mod !== 'string' || !mod.trim()) continue;
    lastPath = mod;
    if (fsImpl.existsSync(mod)) return { path: mod, spec, exists: true };
  }
  return lastPath ? { path: lastPath, spec: null, exists: false } : null;
}

const NEED_ELECTRON_MSG = [
  '',
  '找不到 Electron 运行时 —— 这个包需要它才能启动桌面窗口。',
  '',
  '请任选一种方式：',
  '',
  '  1) 装 Electron 后重试（推荐）：',
  '       npm i -g electron',
  '       dsh-multi-instance',
  '',
  '  2) 直接下载免安装版 / 安装包（不需要 Electron）：',
  `       ${DOWNLOAD_HINT}`,
  '',
  '  3) 从源码跑：',
  '       git clone https://github.com/BOWLUNA/dsh-multi-instance.git',
  '       cd dsh-multi-instance && npm install && npm start',
  '',
].join('\n');

function brokenElectronMsg(binaryPath) {
  return [
    '',
    'Electron 模块装上了，但它指向的可执行文件不存在：',
    '',
    `    ${binaryPath}`,
    '',
    '通常是 npm 的 postinstall 没跑完（装了包但没下载二进制）。修法：',
    '',
    '    npm rebuild electron        # 或 npm i -g electron --force',
    '',
    '或者干脆绕开 Electron，直接用免安装版 / 安装包：',
    '',
    `    ${DOWNLOAD_HINT}`,
    '',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);

  // 只问版本 / 用法时不碰 Electron：这两件事不该有前置条件。
  if (parsed.action === 'version') {
    process.stdout.write(versionText());
    return 0;
  }
  if (parsed.action === 'help') {
    process.stdout.write(helpText());
    return 0;
  }

  const found = resolveElectron();

  if (!found) {
    process.stderr.write(NEED_ELECTRON_MSG);
    return 1;
  }
  if (!found.exists) {
    process.stderr.write(brokenElectronMsg(found.path));
    return 1;
  }

  // 把用户传的参数原样转给 Electron（--demo / --selftest 之类都还能用）
  const args = [APP_ROOT, ...parsed.passthrough];

  // ★ 必须清掉 ELECTRON_RUN_AS_NODE —— 残留为 1 时 electron 会退化成纯 Node，
  //   Chromium 不启动，现象是「双击/执行后毫无反应」。
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(found.path, args, { stdio: 'inherit', env, windowsHide: false });
  child.on('close', (code) => process.exit(code == null ? 0 : code));
  child.on('error', (err) => {
    process.stderr.write(`启动失败：${err.message}\n`);
    process.exit(1);
  });
  return null; // 结果由子进程决定
}

module.exports = {
  resolveElectron,
  candidateSpecs,
  parseArgs,
  versionText,
  helpText,
  APP_ROOT,
  VERSION,
  NEED_ELECTRON_MSG,
};

if (require.main === module) {
  const code = main();
  if (typeof code === 'number') process.exit(code);
}
