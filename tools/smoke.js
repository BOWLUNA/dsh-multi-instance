'use strict';

/**
 * 窗口级冒烟测试 —— `npm run smoke`
 *
 * ── 它补的是哪个洞 ───────────────────────────────────────────────────────
 * `tests/run.js` 里的 57 条用例全是**纯逻辑**：它们能在任何无头环境里跑，
 * 代价是**窗口里的东西一条都测不到**。而这个项目的 bug 大多恰好长在窗口里 ——
 * `<webview>` 挂不上、partition 没隔离、渲染层没起来、打包后资源找不到。
 * 这些都不是逻辑错误，是**环境/装配**错误，只有真起一次窗口才看得见。
 *
 * 所以这里做的是一件很直白的事：**起一次真应用，看它有没有真的把网页显示出来**。
 * 全程不需要网络、不需要真的 DSH —— 脚本自己在本机起一个假 DSH 页面，
 * 断言点落在「那个页面**确实被请求了**」上，这是端到端的证据，
 * 而不是「配置文件里写了什么」这种间接指标。
 *
 * ── 断言清单 ─────────────────────────────────────────────────────────────
 *   1. Electron 二进制能跑，且版本与 package.json 的 devDependency 一致
 *   2. 主进程启动、userData 落在**隔离的临时目录**里（不碰用户真实配置）
 *   3. 渲染层 boot 完成（`renderer boot done`）—— 页面 JS 真的执行了
 *   4. 窗口真的显示了（`窗口已显示`）
 *   5. `webview` 自定义元素已注册（Electron 的 webviewTag 是开着的）
 *   6. 窗格真的挂载并**加载完成**（`webview 加载完成` 且 url 是我们那份假页面）
 *   7. 假 DSH 服务器**收到了请求**（端到端：网页入口真的被拉起来了）
 *   8. 渲染层探针回报的状态符合预期（主题、窗格数、渲染层 API 在不在）
 *   9. 截图落盘、是合法 PNG、且不是「一片纯色」（用体积兜底判断）
 *  10. 进程退出码 0，日志里没有致命错误
 *
 * ── 用法 ─────────────────────────────────────────────────────────────────
 *   npm run smoke                       # 默认场景：一个窗格
 *   node tools/smoke.js --keep          # 失败也保留 .tmp/smoke 供事后翻看
 *   node tools/smoke.js --scene=empty   # 空画布（引导态）
 *   node tools/smoke.js --scene=tile    # 4 个窗格平铺
 *   node tools/smoke.js --exe="dist/win-unpacked/DSH Multi-Instance.exe"
 *                                       # ★ 直接验打包产物（发出去的那个 exe 能不能跑）
 *   node tools/smoke.js --electron=<path>
 *
 * 退出码：0 = 全部通过；1 = 有断言失败（CI 可直接当门禁）。
 */

const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const TMP = path.join(ROOT, '.tmp', 'smoke');
const KEEP = process.argv.includes('--keep');

function argValue(name) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : '';
}

const SCENE = argValue('scene') || 'pane';
const TIMEOUT_MS = Number(argValue('timeout') || 90000);

// ---------------------------------------------------------------- 报告

let passed = 0;
const failures = [];

function ok(what) {
  passed += 1;
  console.log(`  ok   ${what}`);
}
function bad(what, detail) {
  failures.push({ what, detail });
  console.log(`  FAIL ${what}`);
  if (detail) console.log(`       ↳ ${detail}`);
}
function check(cond, what, detail) {
  if (cond) ok(what);
  else bad(what, detail);
}

// ---------------------------------------------------------------- Electron 定位

function resolveElectron() {
  // 直接验打包产物：`node tools/smoke.js --exe="dist/win-unpacked/DSH Multi-Instance.exe"`。
  // 这条路径重要 —— 「源码能跑」和「发出去的那个 exe 能跑」是两件事：
  // 后者的 main.js 是从 app.asar 里读的，漏文件、漏资源都只会在这条路径上现形。
  const exe = argValue('exe');
  if (exe) {
    const abs = path.isAbsolute(exe) ? exe : path.join(ROOT, exe);
    if (!fs.existsSync(abs)) return { error: `打包产物不存在：${abs}（先 npm run dist）` };
    return { path: abs, packaged: true };
  }
  if (argValue('electron')) return { path: argValue('electron') };
  let p;
  try {
    // 在**纯 Node** 里 require('electron') 返回的就是二进制绝对路径（字符串）
    p = require('electron');
  } catch (err) {
    return { error: `找不到 electron 模块：${err.message}` };
  }
  if (typeof p !== 'string') {
    return { error: 'require("electron") 没返回路径（是不是在 Electron 里跑的？）' };
  }
  if (!fs.existsSync(p)) return { error: `electron 二进制不存在：${p}（试试 npm install）` };
  return { path: p };
}

/** 清掉父进程环境里的 ELECTRON_RUN_AS_NODE —— 残留会让 electron 退化成纯 Node。 */
function childEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_NO_ATTACH_CONSOLE;
  return env;
}

// ---------------------------------------------------------------- 假的 DSH 页面

/**
 * 起一个「假 DSH」：只为证明壳子真的把网页入口拉起来了。
 * 记录收到的每一次请求，供事后断言。
 */
function startFakeDsh() {
  return new Promise((resolve) => {
    const hits = [];
    const server = http.createServer((req, res) => {
      hits.push({ url: req.url, ua: String(req.headers['user-agent'] || '') });
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(
        '<!doctype html><html><head><meta charset="utf-8"><title>fake-dsh</title></head>' +
          '<body style="margin:0;background:#f4f1e8;font:14px/1.6 sans-serif;color:#3a3632">' +
          '<h1 style="padding:24px">fake dsh for smoke test</h1></body></html>'
      );
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, hits, port: server.address().port });
    });
  });
}

// ---------------------------------------------------------------- 预置配置

function seedConfig(appData, { instances }) {
  const dir = path.join(appData, 'dsh-multi-instance');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'config.json'),
    JSON.stringify(
      { instances, panes: [], collapsed: [], ui: { theme: 'light', lang: 'zh' } },
      null,
      2
    ),
    'utf8'
  );
  return dir;
}

function instance(id, name, url, port) {
  return { id, name, target: 'remote', url, token: '', port, host: '127.0.0.1', autostart: true };
}

// ---------------------------------------------------------------- 渲染层探针

/**
 * 在渲染层跑一段 JS 并把结果回传（走已有的 `--eval` 通道，日志里是 `eval → {...}`）。
 * 必须是**单行** —— 它是作为命令行参数传进去的。
 */
const PROBE = [
  '(() => {',
  "const w = document.createElement('webview');",
  'return JSON.stringify({',
  'ok: true,',
  "theme: document.documentElement.getAttribute('data-theme') || '',",
  "webviewTag: typeof w.getWebContentsId === 'function' && typeof w.executeJavaScript === 'function',",
  "panes: document.querySelectorAll('webview').length,",
  "api: !!(window.__dsh && typeof window.__dsh === 'object'),",
  'size: [window.innerWidth, window.innerHeight]',
  '});',
  '})()',
].join(' ');

// ---------------------------------------------------------------- 主流程

async function main() {
  console.log('窗口冒烟测试 —— 起一次真应用，看网页有没有真的被渲染出来\n');

  const el = resolveElectron();
  if (el.error) {
    bad('定位 Electron 二进制', el.error);
    return finish();
  }
  const packaged = !!el.packaged;
  ok(packaged ? `打包产物就位：${el.path}` : `Electron 二进制就位：${el.path}`);

  // 版本对齐：package.json 里写的 devDependency 必须就是实际跑的这一个。
  // 注意 npm 可能存成 `^44.4.3`，比较前把范围前缀剥掉 —— 这里比的是「装的是不是这个版本」。
  // 跑打包产物时跳过磁盘那一版（那时用的是 electron-builder 塞进去的 dist，
  // 下面「运行时 electron=…」那条才是真正的证据）。
  const want = String(require(path.join(ROOT, 'package.json')).devDependencies.electron).replace(
    /^[\^~>=<v\s]+/,
    ''
  );
  if (packaged) {
    // PE 校验：别把「文件在那儿」当成「文件能用」
    const head = fs.readFileSync(el.path).subarray(0, 2).toString('latin1');
    check(head === 'MZ', '打包产物是有效的 PE 可执行文件', `文件头是 ${JSON.stringify(head)}，不是 MZ`);
  } else {
    const binDir = path.dirname(el.path);
    const pkgJson = path.join(binDir, '..', 'package.json');
    let actual = '';
    try {
      actual = JSON.parse(fs.readFileSync(pkgJson, 'utf8')).version || '';
    } catch {
      /* 读不到就跳过这条比对，下面还有运行时那一版兜底 */
    }
    if (actual) {
      check(
        actual === want,
        `Electron 版本与 package.json 一致（${actual}）`,
        `package.json 写的是 ${want}，实际装的是 ${actual}`
      );
    }
  }

  const fake = await startFakeDsh();
  const local = `http://127.0.0.1:${fake.port}/`;
  ok(`假 DSH 已就位：${local}`);

  const appData = path.join(TMP, 'appdata');
  fs.rmSync(TMP, { recursive: true, force: true });

  const n = SCENE === 'tile' ? 4 : SCENE === 'empty' ? 0 : 1;
  const instances = [];
  for (let i = 1; i <= n; i += 1) {
    instances.push(instance(i === 1 ? 'smoke-1' : `smoke-${i}`, `Smoke ${i}`, local, fake.port));
  }
  const userData = seedConfig(appData, { instances });
  ok(`已预置配置（${n} 个实例）：${path.relative(ROOT, userData)}`);

  const shot = path.join(TMP, 'smoke.png');
  const args = [];
  if (!packaged) args.push(ROOT); // 开发态要显式指定应用目录；打包产物自己知道
  args.push(
    '--verbose',
    `--shot=${shot}`,
    '--shot-delay=3500',
    '--shot-exit',
    `--eval=${PROBE}`
  );
  if (n > 0) args.push('--demo');

  console.log(`\n  启动：${path.basename(el.path)} ${args.join(' ')}\n`);

  const run = await new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    const child = spawn(el.path, args, {
      cwd: packaged ? path.dirname(el.path) : ROOT,
      env: childEnv({ APPDATA: appData, LOCALAPPDATA: path.join(appData, 'Local') }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      try {
        child.kill();
      } catch {
        /* ignore */
      }
      resolve({ code: null, out, err, killed: true });
    }, TIMEOUT_MS);

    child.stdout.on('data', (d) => {
      out += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      err += d.toString('utf8');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      if (!done) {
        done = true;
        resolve({ code: null, out, err: err + '\n' + e.message, spawnError: e.message });
      }
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (!done) {
        done = true;
        resolve({ code, out, err });
      }
    });
  });

  fake.server.close();

  const log = run.out + '\n' + run.err;
  const has = (re) => re.test(log);

  // ---- 1. 进程本身
  if (run.spawnError) bad('应用能起来', run.spawnError);
  else ok('应用能起来（进程正常结束）');

  if (run.killed) bad('应用在超时前自行退出', `超过 ${TIMEOUT_MS}ms 还没退出（是不是卡在弹窗或单实例锁上？）`);

  const bootRe = /应用启动 electron=([\d.]+) chrome=([\d.]+)/;
  const boot = log.match(bootRe);
  check(!!boot, '主进程启动日志（含 electron / chrome 版本）', '没看到「应用启动」那一行');
  if (boot) {
    check(boot[1] === want, `运行时 electron=${boot[1]} 与 package.json 一致`, `期望 ${want}，实际 ${boot[1]}`);
    console.log(`       运行时 chrome=${boot[2]}`);
  }

  check(
    new RegExp(`userData=${userData.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}`).test(log),
    'userData 落在隔离的临时目录里（没碰用户真实配置）',
    'userData 那行不是我们给的临时目录'
  );

  // ---- 2. 渲染层
  check(has(/\[renderer\] renderer boot done/), '渲染层 boot 完成', '没看到「renderer boot done」');
  check(has(/窗口已显示/), '窗口真的显示了', '没看到「窗口已显示」');

  // ---- 3. webview 通道（空画布场景不该有 webview，断言反过来）
  if (n === 0) {
    check(!has(/webview 挂载 partition=/), '空画布场景没有挂载任何 webview', '空配置下居然挂了 webview');
    check(!has(/webview 加载完成/), '空画布场景没有任何 webview 加载', '空配置下居然有 webview 加载');
  } else {
    check(
      has(/webview 挂载 partition=/),
      '窗格挂载了 webview（走 will-attach-webview）',
      '没有 webview 挂载记录 —— will-attach-webview 可能又注册错对象了'
    );
    check(has(/webview 加载完成/), 'webview 加载完成', '没有 webview 加载完成记录');
    check(
      has(new RegExp(`webview 加载完成[^\\n]*url=http://127\\.0\\.0\\.1:${fake.port}/`)),
      '加载的正是我们那份假 DSH 页面',
      '加载的 url 不对'
    );
  }

  const attach = log.match(/webview 挂载 partition=([^\s]+)/);
  if (attach) {
    check(/^persist:pane-/.test(attach[1]), `每个窗格独立 partition（${attach[1]}）`, `partition 不是 persist:pane-*：${attach[1]}`);
  }

  // ---- 4. 端到端：假 DSH 真的被请求了
  if (n === 0) {
    ok(`空画布场景：假 DSH 收到 ${fake.hits.length} 次请求（不属于本场景的断言，只记录）`);
  } else {
    check(fake.hits.length > 0, `假 DSH 收到了 ${fake.hits.length} 次请求（端到端）`, '一个请求都没有 —— 网页入口没被拉起来');
  }
  if (fake.hits.length && n > 0) {
    console.log('       请求方 UA：');
    for (const h of fake.hits) {
      console.log(`         ${h.ua.includes('Electron/') ? '✗' : '✓'} ${h.ua.slice(0, 90)}`);
    }
    // 壳子给窗格设过 Chromium UA（main.js 的 chromeUA）。用「有没有 Electron/ 字样」
    // 反过来判这条设置有没有真的落到 session 上 —— 这是运行时证据，不是读配置。
    const fromPane = fake.hits.find((h) => /Chrome\//.test(h.ua) && !/probe/.test(h.ua));
    check(!!fromPane, '有来自窗格（而非探测）的请求', '只看到探测请求，说明 webview 可能没真的导航');
    if (fromPane) {
      check(
        !/Electron\//.test(fromPane.ua),
        '窗格请求用的是纯 Chromium UA（不是 Electron/…）',
        `UA 里带 Electron 字样，说明 session 上的 setUserAgent 没生效：${fromPane.ua}`
      );
    }
  }

  // ---- 5. 渲染层探针
  const ev = log.match(/eval → (.*)/);
  check(!!ev, '渲染层探针有回传', '没有「eval →」那一行');
  if (ev) {
    let probe = null;
    try {
      probe = JSON.parse(JSON.parse(ev[1]));
    } catch {
      /* 下面按失败处理 */
    }
    if (!probe) {
      bad('渲染层探针返回值能解析', `原始值：${ev[1].slice(0, 200)}`);
    } else {
      ok(`渲染层探针：主题=${probe.theme} 窗格=${probe.panes} 视口=${probe.size.join('x')}`);
      check(probe.ok === true, '渲染层 JS 真的执行了', '探针没跑起来');
      check(probe.webviewTag === true, 'webview 自定义元素已注册（webviewTag 开着）', 'webviewTag 没生效');
      check(probe.panes === n, `画布上窗格数 = ${n}`, `期望 ${n}，实际 ${probe.panes}`);
      check(probe.api === true, '渲染层暴露了自动化 API（window.__dsh）', 'window.__dsh 不在');
      check(probe.size[0] > 200 && probe.size[1] > 200, `窗口视口合理（${probe.size.join('x')}）`, '视口太小，窗口可能没真的建起来');
    }
  }

  // ---- 6. 截图
  const shotOk = fs.existsSync(shot);
  check(shotOk, '截图落盘', `没生成 ${shot}`);
  if (shotOk) {
    const buf = fs.readFileSync(shot);
    const magic = buf.subarray(0, 8).toString('hex');
    check(magic === '89504e470d0a1a0a', '截图是合法 PNG（magic number）', `头 8 字节是 ${magic}`);
    // 纯色图会被压得极小；有界面的截图不会。这是个便宜的「不是一片空白」判据。
    check(buf.length > 8000, `截图有内容（${buf.length} 字节）`, '截图太小，可能是全空白');
  }

  // ---- 7. 致命错误 / 护栏
  const fatal = log
    .split('\n')
    .filter((l) => /Uncaught|uncaughtException|FATAL|did-fail-load|webview 加载失败|截图失败/.test(l));
  check(fatal.length === 0, '日志里没有致命错误', fatal.slice(0, 3).join(' | '));

  const guard = log.split('\n').filter((l) => /\[guard\]/.test(l));
  check(
    guard.length === 0,
    '主进程的「挂载钩子没接上」护栏没报警',
    guard.slice(0, 2).join(' | ')
  );

  check(run.code === 0, `退出码 0（实际 ${run.code}）`, '非零退出码');

  if (KEEP) console.log(`\n  临时目录保留在：${path.relative(ROOT, TMP)}`);
  else if (failures.length === 0) fs.rmSync(TMP, { recursive: true, force: true });

  return finish();
}

function finish() {
  console.log('');
  if (failures.length === 0) {
    console.log(`PASS  passed=${passed} failed=0`);
    process.exitCode = 0;
  } else {
    console.log(`FAIL  passed=${passed} failed=${failures.length}`);
    for (const f of failures) console.log(`  - ${f.what}${f.detail ? `：${f.detail}` : ''}`);
    process.exitCode = 1;
  }
  return process.exitCode;
}

main().catch((err) => {
  console.error('冒烟测试自己崩了：', err && err.stack ? err.stack : err);
  process.exit(1);
});
