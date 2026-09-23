'use strict';
/**
 * 拍 README 用的干净截图。
 *
 * 要求：**英文界面 + 浅色主题 + DSH 里没有任何东西**。
 * 做法：预置一份 config.json（实例指向全新 DSH_HOME 起的干净实例，无历史会话），
 * 再用套壳自己的 --eval / --shot 开关驱动界面并截图。不碰产品代码。
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const ELECTRON = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
const OUT = path.join(ROOT, 'docs', 'images');
const TMP = path.join(ROOT, '.tmp', 'shots');

const TOKEN = process.env.CLEAN_TOKEN || '';
const PORT = process.env.CLEAN_PORT || '3088';
const URL_FULL = `http://127.0.0.1:${PORT}/?token=${TOKEN}`;

/** 预置一份用户配置：浅色 + 英文 + 抽屉常驻 */
function seedConfig(dir, { sidePinned = true, topPinned = true, n = 1 } = {}) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });

  // 同一个干净实例开 n 份 —— 每格都显示空白的 DSH，不会泄露任何会话内容
  const instances = [];
  for (let i = 1; i <= n; i += 1) {
    instances.push({
      id: i === 1 ? 'shot-clean' : `shot-clean-${i}`,
      name: n === 1 ? 'DSH' : `DSH ${i}`,
      target: 'remote',
      url: URL_FULL,
      token: TOKEN,
      port: Number(PORT),
      host: '127.0.0.1',
      autostart: false,
    });
  }

  const cfg = {
    instances,
    panes: [],
    collapsed: [],
    ui: { theme: 'light', lang: 'en', topPinned, sidePinned },
  };
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg, null, 2), 'utf8');
}

function shot(name, js, delayMs, seedOpts) {
  return new Promise((resolve) => {
    const ud = path.join(TMP, 'ud-' + name);
    seedConfig(ud, seedOpts);

    const args = [
      ROOT,
      ...(js ? [`--eval=${js}`] : []),
      `--shot=${path.join(OUT, name + '.png')}`,
      `--shot-delay=${delayMs}`,
      '--shot-exit',
      `--user-data-dir=${ud}`,
      // DSH 的界面语言跟着浏览器的 locale 走。本机是 zh-CN，会让 DSH 显示中文；
      // 截图要英文，所以显式把 Chromium 的 locale 压成 en-US
      '--lang=en-US',
      // 关掉启动时的自动发现弹窗（会盖住画面，也会露出本机路径）
      '--no-discover',
      // 地址栏里的 token 打码
      '--mask-token',
    ];

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;

    const c = spawn(ELECTRON, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => {
      const png = path.join(OUT, name + '.png');
      const ok = fs.existsSync(png);
      const kb = ok ? (fs.statSync(png).size / 1024).toFixed(0) : 0;
      console.log(`  ${ok ? '✓' : '✗'} ${name}.png   ${kb}KB`);
      if (!ok) {
        const tail = out.split('\n').filter(Boolean).slice(-3).join(' | ');
        console.log('    ', tail.slice(0, 200));
      }
      resolve(ok);
    });
  });
}

/**
 * 打开实例 → 等加载 → 点掉 dsh 的首次引导弹窗 → 摆位置。
 *
 * 那串引导（同意页 / API key 页）是 dsh 首次启动的一次性弹窗，不点掉主界面就被盖住。
 * 它们渲染在 webview 内部，宿主拿不到 DOM，所以只能把 JS 投递进 webview。
 */
(async () => {
  console.log('干净实例:', URL_FULL.replace(/token=.*/, 'token=***'));
  console.log('输出到:', OUT);
  console.log('');
  fs.mkdirSync(OUT, { recursive: true });

  // 01 主图：单窗格铺满，抽屉都收着（画面最干净）
  await shot(
    '01-hero',
    `(async () => {
       await window.__dsh.openInstance('shot-clean');
       await new Promise(s => setTimeout(s, 20000));
       await window.__dsh.dismissNotice();
       window.__dsh.showTop(false);
       window.__dsh.showSide(false);
       window.__dsh.layout.setRect('shot-clean', { x: 0, y: 0, w: 1, h: 1 });
       await new Promise(s => setTimeout(s, 2500));
       return 'ok';
     })()`,
    28000,
    { sidePinned: false, topPinned: false, n: 1 }
  );

  // 02 左侧抽屉展开（实例列表 + 三个按钮）
  await shot(
    '02-sidebar',
    `(async () => {
       await window.__dsh.openInstance('shot-clean');
       await new Promise(s => setTimeout(s, 11000));
       await window.__dsh.dismissNotice();
       window.__dsh.showTop(true);
       window.__dsh.showSide(true);
       await new Promise(s => setTimeout(s, 1200));
       return 'ok';
     })()`,
    17000,
    { sidePinned: true, topPinned: false, n: 1 }
  );

  // 03 四窗格平铺 —— 每格都是同一份空白 DSH
  await shot(
    '03-tile',
    `(async () => {
       const ids = ['shot-clean','shot-clean-2','shot-clean-3','shot-clean-4'];
       for (const id of ids) {
         await window.__dsh.openInstance(id);
         await new Promise(s => setTimeout(s, 9000));
         await window.__dsh.dismissNotice();
       }
       window.__dsh.layout.tileAll();
       await new Promise(s => setTimeout(s, 1500));
       return 'panes=' + window.__dsh.layout.list().length;
     })()`,
    62000,
    { sidePinned: false, topPinned: true, n: 4 }
  );

  console.log('\n完成。');
})();
