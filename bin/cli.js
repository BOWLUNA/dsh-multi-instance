#!/usr/bin/env node
'use strict';

/**
 * npm 包的可执行入口。
 *
 * 这是个 Electron 桌面应用，不是命令行工具 —— 这个 bin 的作用是：
 * 找到随包安装的 electron 二进制，用它把应用拉起来。
 *
 * 注意：`electron` 在 package.json 里是 devDependency，npm 全局安装时不会装它。
 * 所以这里要按顺序找：
 *   1. 本包 node_modules 里的 electron（开发/本地安装时）
 *   2. 全局 node_modules 里的 electron
 *   3. 已经装好的打包版（如果用户从 Releases 装的，直接用那个）
 * 都找不到就给出明确指引，而不是抛一堆栈。
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const APP_ROOT = path.resolve(__dirname, '..');

function tryRequireElectron() {
  const candidates = [
    path.join(APP_ROOT, 'node_modules', 'electron'),
    path.join(APP_ROOT, '..', 'electron'),
    'electron',
  ];
  for (const c of candidates) {
    try {
      // eslint-disable-next-line import/no-dynamic-require, global-require
      const mod = require(c);
      if (typeof mod === 'string' && fs.existsSync(mod)) return mod;
      if (typeof mod === 'string') return mod;
    } catch {
      /* 继续试下一个 */
    }
  }
  return null;
}

function main() {
  const electronPath = tryRequireElectron();
  if (!electronPath) {
    process.stderr.write(
      [
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
        '       https://github.com/BOWLUNA/dsh-multi-instance/releases',
        '',
        '  3) 从源码跑：',
        '       git clone https://github.com/BOWLUNA/dsh-multi-instance.git',
        '       cd dsh-multi-instance && npm install && npm start',
        '',
      ].join('\n')
    );
    process.exit(1);
  }

  // 把用户传的参数原样转给 Electron（--demo / --selftest 之类都还能用）
  const args = [APP_ROOT, ...process.argv.slice(2)];

  // ★ 必须清掉 ELECTRON_RUN_AS_NODE —— 残留为 1 时 electron 会退化成纯 Node，
  //   Chromium 不启动，现象是「双击/执行后毫无反应」。
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(electronPath, args, { stdio: 'inherit', env, windowsHide: false });
  child.on('close', (code) => process.exit(code == null ? 0 : code));
  child.on('error', (err) => {
    process.stderr.write(`启动失败：${err.message}\n`);
    process.exit(1);
  });
}

main();
