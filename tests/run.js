#!/usr/bin/env node
'use strict';

/**
 * 可无头运行的测试套件（不需要 GUI、不需要 Electron）。
 *
 * 为什么要有它：仓库里原先只有 `--selftest*` 那几个开关，而它们**全都要起一个真窗口** ——
 * 在没有图形界面的环境（CI、SSH、容器）里一条都跑不了。于是「改完有没有改坏」
 * 只能靠肉眼，这次踩到的 userData 落点漂移就是这么漏过去的。
 *
 *   用法：  npm test
 *   约定：  零依赖、纯 Node、退出码即结论（0 = 全过）。
 *
 * 覆盖的是**纯逻辑**：目录落点与迁移、地址解析、CLI 的运行时查找。
 * 窗口行为、渲染层交互仍然只能靠 `--selftest*`（需要 GUI）。
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const appdata = require('../src/main/appdata');
const instances = require('../src/main/instances');
const cli = require('../bin/cli');

let passed = 0;
let failed = 0;
const failures = [];
let currentSuite = '';

function suite(name) {
  currentSuite = name;
  process.stdout.write(`\n${name}\n`);
}

function test(name, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`  ok   ${name}\n`);
  } catch (err) {
    failed += 1;
    failures.push({ suite: currentSuite, name, err });
    process.stdout.write(`  FAIL ${name}\n       ${err.message.split('\n')[0]}\n`);
  }
}

// ---------------------------------------------------------------- 工具

let tmpRoot = null;
function sandbox() {
  if (!tmpRoot) {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'dsmi-test-'));
  }
  return fs.mkdtempSync(path.join(tmpRoot, 'case-'));
}

/** 造一个假的 appData 根，并按名字塞目录/config */
function fakeAppData({ legacy = {}, target = null } = {}) {
  const root = sandbox();
  for (const [name, cfg] of Object.entries(legacy)) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    if (cfg !== null) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(cfg));
    if (cfg && cfg.__partitions) {
      fs.mkdirSync(path.join(dir, 'Partitions'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'Partitions', 'marker.txt'), 'x');
    }
  }
  if (target) {
    const dir = path.join(root, 'dsh-multi-instance');
    fs.mkdirSync(dir, { recursive: true });
    if (target.config) fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(target.config));
    if (target.partitions) {
      fs.mkdirSync(path.join(dir, 'Partitions'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'Partitions', 'own.txt'), 'y');
    }
  }
  return root;
}

const panes = (n) => ({ panes: Array.from({ length: n }, (_, i) => ({ id: `p${i}` })) });

function cleanup() {
  if (tmpRoot) {
    try {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* 临时目录清不掉不影响结论 */
    }
  }
}

// ================================================================ appdata

suite('appdata · 落点解析');

test('win32 → %APPDATA%\\dsh-multi-instance', () => {
  const got = appdata.resolveUserData({
    env: { APPDATA: 'C:\\Users\\x\\AppData\\Roaming', USERPROFILE: 'C:\\Users\\x' },
    platform: 'win32',
  });
  assert.strictEqual(got, path.join('C:\\Users\\x\\AppData\\Roaming', 'dsh-multi-instance'));
});

test('win32 无 APPDATA 时回落到 USERPROFILE\\AppData\\Roaming', () => {
  const got = appdata.resolveUserData({
    env: { USERPROFILE: 'C:\\Users\\x' },
    platform: 'win32',
  });
  assert.strictEqual(got, path.join('C:\\Users\\x', 'AppData', 'Roaming', 'dsh-multi-instance'));
});

test('darwin → ~/Library/Application Support', () => {
  const got = appdata.resolveUserData({ env: { HOME: '/Users/x' }, platform: 'darwin' });
  assert.strictEqual(got, path.join('/Users/x', 'Library', 'Application Support', 'dsh-multi-instance'));
});

test('linux → $XDG_CONFIG_HOME 优先', () => {
  const got = appdata.resolveUserData({ env: { HOME: '/home/x', XDG_CONFIG_HOME: '/cfg' }, platform: 'linux' });
  assert.strictEqual(got, path.join('/cfg', 'dsh-multi-instance'));
});

test('目录名是常量，不随 package.json 的 name / productName 变', () => {
  assert.strictEqual(appdata.APP_DIRNAME, 'dsh-multi-instance');
});

test('三种历史目录名都在迁移名单里', () => {
  for (const n of ['dsh-shell', 'dsh-webview-desktop', 'DSH Multi-Instance']) {
    assert.ok(appdata.LEGACY_DIRNAMES.includes(n), `缺 ${n}`);
  }
});

suite('appdata · 配置读取');

test('坏 JSON 当空配置，不抛', () => {
  const dir = sandbox();
  fs.writeFileSync(path.join(dir, 'config.json'), '{ this is not json');
  assert.strictEqual(appdata.readConfig(path.join(dir, 'config.json')), null);
  assert.strictEqual(appdata.paneCount(appdata.readConfig(path.join(dir, 'config.json'))), 0);
});

test('panes 不是数组时算 0', () => {
  assert.strictEqual(appdata.paneCount({ panes: 'oops' }), 0);
  assert.strictEqual(appdata.paneCount(null), 0);
});

suite('appdata · 迁移计划');

test('全新机器：没有旧目录 → skip-no-legacy', () => {
  const root = fakeAppData();
  const plan = appdata.planMigration({ userData: path.join(root, 'dsh-multi-instance') });
  assert.strictEqual(plan.action, 'skip-no-legacy');
});

test('目标目录已有窗格 → skip-target-ok（不去动旧目录）', () => {
  const root = fakeAppData({
    legacy: { 'dsh-shell': panes(3) },
    target: { config: panes(2) },
  });
  const plan = appdata.planMigration({ userData: path.join(root, 'dsh-multi-instance') });
  assert.strictEqual(plan.action, 'skip-target-ok');
  assert.strictEqual(plan.targetPanes, 2);
});

test('旧目录有窗格、目标目录空 → migrate', () => {
  const root = fakeAppData({
    legacy: { 'dsh-shell': { ...panes(5), __partitions: true } },
    target: { config: { ui: { theme: 'light' } } },
  });
  const plan = appdata.planMigration({ userData: path.join(root, 'dsh-multi-instance') });
  assert.strictEqual(plan.action, 'migrate');
  assert.strictEqual(plan.panes, 5);
  assert.deepStrictEqual(plan.carry, ['Partitions']);
});

test('旧目录存在但没有窗格 → skip-no-panes', () => {
  const root = fakeAppData({ legacy: { 'dsh-shell': { ui: {} } } });
  const plan = appdata.planMigration({ userData: path.join(root, 'dsh-multi-instance') });
  assert.strictEqual(plan.action, 'skip-no-panes');
});

test('多个旧目录：取窗格最多的那个', () => {
  const root = fakeAppData({
    legacy: { 'dsh-shell': panes(1), 'dsh-webview-desktop': panes(7), 'DSH Multi-Instance': panes(3) },
  });
  const plan = appdata.planMigration({ userData: path.join(root, 'dsh-multi-instance') });
  assert.strictEqual(plan.action, 'migrate');
  assert.strictEqual(plan.fromName, 'dsh-webview-desktop');
  assert.strictEqual(plan.panes, 7);
});

test('旧目录的 config 是坏的 → 不算候选', () => {
  const root = fakeAppData({ legacy: { 'dsh-shell': null } });
  fs.writeFileSync(path.join(root, 'dsh-shell', 'config.json'), 'broken{');
  const plan = appdata.planMigration({ userData: path.join(root, 'dsh-multi-instance') });
  assert.strictEqual(plan.action, 'skip-no-panes');
});

suite('appdata · 迁移执行');

test('迁移会把 config.json 与 Partitions 一起接过来了', () => {
  const root = fakeAppData({
    legacy: { 'dsh-shell': { ...panes(5), __partitions: true } },
    target: { config: { ui: {} } },
  });
  const userData = path.join(root, 'dsh-multi-instance');
  const plan = appdata.planMigration({ userData });
  const res = appdata.applyMigration(plan);
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.copied, ['config.json', 'Partitions']);

  const now = appdata.readConfig(path.join(userData, 'config.json'));
  assert.strictEqual(appdata.paneCount(now), 5);
  assert.ok(fs.existsSync(path.join(userData, 'Partitions', 'marker.txt')));
});

test('目标目录已有自己的 Partitions → 不覆盖（carry 为空）', () => {
  const root = fakeAppData({
    legacy: { 'dsh-shell': { ...panes(5), __partitions: true } },
    target: { partitions: true },
  });
  const userData = path.join(root, 'dsh-multi-instance');
  const plan = appdata.planMigration({ userData });
  assert.deepStrictEqual(plan.carry, []);
  appdata.applyMigration(plan);
  assert.ok(fs.existsSync(path.join(userData, 'Partitions', 'own.txt')));
  assert.ok(!fs.existsSync(path.join(userData, 'Partitions', 'marker.txt')));
});

test('幂等：连跑两次，第二次是 skip-target-ok', () => {
  const root = fakeAppData({ legacy: { 'dsh-shell': panes(4) } });
  const userData = path.join(root, 'dsh-multi-instance');
  appdata.bootstrap({ userData });
  const second = appdata.bootstrap({ userData });
  assert.strictEqual(second.plan.action, 'skip-target-ok');
  assert.strictEqual(second.result.copied.length, 0);
});

test('迁移失败不抛（目标目录不可写）', () => {
  const plan = {
    action: 'migrate',
    userData: path.join(sandbox(), 'nope', 'deeply', 'x'),
    from: '\u0000invalid-path',
    fromName: 'fake',
    panes: 1,
    carry: [],
  };
  const res = appdata.applyMigration(plan, { logger: () => {} });
  assert.strictEqual(res.ok, false);
  assert.ok(res.error);
});

test('bootstrap 返回钉死的 userData，且等于传入值', () => {
  const root = fakeAppData();
  const userData = path.join(root, 'dsh-multi-instance');
  const boot = appdata.bootstrap({ userData });
  assert.strictEqual(boot.userData, userData);
});

// ================================================================ bin/cli

suite('bin/cli · Electron 运行时查找');

test('命中存在的二进制 → exists=true', () => {
  const fake = path.join(sandbox(), 'electron.exe');
  fs.writeFileSync(fake, '');
  const got = cli.resolveElectron({
    appRoot: path.join(sandbox(), 'app'),
    require: () => fake,
  });
  assert.strictEqual(got.exists, true);
  assert.strictEqual(got.path, fake);
});

test('模块在但二进制缺失 → exists=false（不再骗人）', () => {
  const got = cli.resolveElectron({
    appRoot: path.join(sandbox(), 'app'),
    require: () => path.join(sandbox(), 'missing', 'electron.exe'),
  });
  assert.strictEqual(got.exists, false);
  assert.ok(got.path.endsWith('electron.exe'));
});

test('一个都没装 → null', () => {
  const got = cli.resolveElectron({
    appRoot: path.join(sandbox(), 'app'),
    require: () => {
      throw new Error('MODULE_NOT_FOUND');
    },
  });
  assert.strictEqual(got, null);
});

test('第一个候选报错时继续试后面的', () => {
  const fake = path.join(sandbox(), 'electron.exe');
  fs.writeFileSync(fake, '');
  let n = 0;
  const got = cli.resolveElectron({
    appRoot: path.join(sandbox(), 'app'),
    require: () => {
      n += 1;
      if (n === 1) throw new Error('MODULE_NOT_FOUND');
      return fake;
    },
  });
  assert.strictEqual(got.exists, true);
  assert.strictEqual(n, 2);
});

test('candidateSpecs 有三档，最后一个是裸说明符 electron', () => {
  const specs = cli.candidateSpecs('/app');
  assert.strictEqual(specs.length, 3);
  assert.strictEqual(specs[2], 'electron');
});

test('未找到时的指引里不含未替换的占位符', () => {
  assert.ok(!cli.NEED_ELECTRON_MSG.includes('<repo>'));
  assert.ok(cli.NEED_ELECTRON_MSG.includes('npm i -g electron'));
});

// ================================================================ instances

suite('instances · 地址解析（纯函数）');

test('applyToken 追加 token', () => {
  assert.strictEqual(
    instances.applyToken('http://127.0.0.1:3080/', 'abc'),
    'http://127.0.0.1:3080/?token=abc'
  );
});

test('applyToken 已有 token 就不重复加', () => {
  const url = 'http://127.0.0.1:3080/?token=old';
  assert.strictEqual(instances.applyToken(url, 'new'), url);
});

test('applyToken 空 token 原样返回', () => {
  assert.strictEqual(instances.applyToken('http://x/', ''), 'http://x/');
});

test('applyToken 有 query 时用 &', () => {
  assert.strictEqual(instances.applyToken('http://x/?a=1', 't'), 'http://x/?a=1&token=t');
});

test('applyToken 对 token 做 URL 编码', () => {
  assert.strictEqual(instances.applyToken('http://x/', 'a b&c'), 'http://x/?token=a%20b%26c');
});

test('pickUrlFrom 从日志里挑出带 token 的 dsh 地址', () => {
  const log = 'starting...\n  dsh web ready at http://127.0.0.1:3080/?token=Zx9_-abc\n done';
  assert.strictEqual(instances.pickUrlFrom(log), 'http://127.0.0.1:3080/?token=Zx9_-abc');
});

test('pickUrlFrom 没有 token 地址时退回任意 http 地址', () => {
  assert.strictEqual(instances.pickUrlFrom('see https://example.com/x now'), 'https://example.com/x');
});

test('pickUrlFrom 空输入返回空串', () => {
  assert.strictEqual(instances.pickUrlFrom(''), '');
  assert.strictEqual(instances.pickUrlFrom(null), '');
});

test('wslArgs 默认发行版 Ubuntu、不加 -u', () => {
  assert.deepStrictEqual(instances.wslArgs({}, 'echo hi'), [
    '-d', 'Ubuntu', '--exec', 'bash', '-lc', 'echo hi',
  ]);
});

test('wslArgs 指定发行版与用户', () => {
  assert.deepStrictEqual(instances.wslArgs({ distro: 'Debian', user: 'bow' }, 'true'), [
    '-d', 'Debian', '-u', 'bow', '--exec', 'bash', '-lc', 'true',
  ]);
});

test('wslArgs 用户为空白时不加 -u', () => {
  const args = instances.wslArgs({ distro: 'Ubuntu', user: '   ' }, 'true');
  assert.ok(!args.includes('-u'));
});

// ================================================================ 收尾

cleanup();

process.stdout.write(`\n${failed === 0 ? 'PASS' : 'FAIL'}  passed=${passed} failed=${failed}\n`);
if (failed) {
  process.stdout.write('\n失败详情：\n');
  for (const f of failures) {
    process.stdout.write(`\n[${f.suite}] ${f.name}\n${f.err.stack}\n`);
  }
}
process.exit(failed === 0 ? 0 : 1);
