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

function main() {
  const found = resolveElectron();

  if (!found) {
    process.stderr.write(NEED_ELECTRON_MSG);
    process.exit(1);
  }
  if (!found.exists) {
    process.stderr.write(brokenElectronMsg(found.path));
    process.exit(1);
  }

  // 把用户传的参数原样转给 Electron（--demo / --selftest 之类都还能用）
  const args = [APP_ROOT, ...process.argv.slice(2)];

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
}

module.exports = { resolveElectron, candidateSpecs, APP_ROOT, NEED_ELECTRON_MSG };

if (require.main === module) main();
