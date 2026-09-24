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
 * 覆盖的是**纯逻辑**：目录落点与迁移、配置读写的备份与损坏恢复、地址解析、
 * CLI 的参数解析与运行时查找。
 * 窗口行为、渲染层交互仍然只能靠 `--selftest*`（需要 GUI）。
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const appdata = require('../src/main/appdata');
const instances = require('../src/main/instances');
const Store = require('../src/main/store');
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

suite('store · 配置的读写、备份与损坏恢复');

/** 造一个只属于自己的配置目录 */
function storeDir() {
  return sandbox();
}

test('读写往返：set 之后新建实例能读回来', () => {
  const file = path.join(storeDir(), 'config.json');
  const a = new Store(file, { log: () => {} });
  a.set('instances', [{ id: 'i1' }]);
  const b = new Store(file, { log: () => {} });
  assert.deepStrictEqual(b.get('instances'), [{ id: 'i1' }]);
  assert.strictEqual(b.recoveredFrom, null);
  assert.strictEqual(b.quarantined, null);
});

test('首次写入不产生备份（还没有旧内容可留）', () => {
  const file = path.join(storeDir(), 'config.json');
  new Store(file, { log: () => {} }).set('ui', { theme: 'light' });
  assert.ok(fs.existsSync(file));
  assert.ok(!fs.existsSync(Store.backupPath(file, 1)));
});

test('第二次写入前，把能解析的旧内容留成 bak-1', () => {
  const file = path.join(storeDir(), 'config.json');
  const s = new Store(file, { log: () => {} });
  s.set('instances', ['第一版']);
  s.set('instances', ['第二版']);
  const bak = JSON.parse(fs.readFileSync(Store.backupPath(file, 1), 'utf8'));
  assert.deepStrictEqual(bak.instances, ['第一版']);
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')).instances, ['第二版']);
});

test(`备份最多保留 ${Store.BACKUP_KEEP} 份，最老的被挤掉`, () => {
  const file = path.join(storeDir(), 'config.json');
  const s = new Store(file, { log: () => {} });
  for (let i = 1; i <= Store.BACKUP_KEEP + 3; i += 1) s.set('n', i);
  for (let i = 1; i <= Store.BACKUP_KEEP; i += 1) {
    assert.ok(fs.existsSync(Store.backupPath(file, i)), `缺 bak-${i}`);
  }
  assert.ok(!fs.existsSync(Store.backupPath(file, Store.BACKUP_KEEP + 1)), 'bak-N+1 不该存在');
  // bak-1 应当就是刚被覆盖的那一版
  assert.strictEqual(JSON.parse(fs.readFileSync(Store.backupPath(file, 1), 'utf8')).n, Store.BACKUP_KEEP + 3 - 1);
});

test('★ 配置损坏 → 从 bak-1 回退，并写回主文件（自愈）', () => {
  const file = path.join(storeDir(), 'config.json');
  const s = new Store(file, { log: () => {} });
  s.set('instances', [{ id: 'i1' }, { id: 'i2' }]);
  s.set('ui', { theme: 'dark' }); // 这一步产生 bak-1（含 instances）
  fs.writeFileSync(file, '{"instances":[{"id":"i1"', 'utf8'); // 半截 JSON

  const recovered = new Store(file, { log: () => {} });
  assert.strictEqual(recovered.get('instances').length, 2);
  assert.ok(recovered.recoveredFrom, '应当记录回退来源');
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(file, 'utf8')).instances,
    [{ id: 'i1' }, { id: 'i2' }],
    '回退结果要写回主文件'
  );
  assert.ok(!fs.existsSync(file + '.tmp'), '不留下临时文件');
});

test('★ 配置损坏且没有任何备份 → 残片必须被保留，不能静默抹掉', () => {
  const file = path.join(storeDir(), 'config.json');
  fs.writeFileSync(file, '{"instances":[1,2,3],"panes":[1,', 'utf8');
  const broken = '{"instances":[1,2,3],"panes":[1,';
  const s = new Store(file, { log: () => {} });
  assert.deepStrictEqual(s.all(), {}, '按空配置继续');
  assert.ok(s.quarantined, '应当留下隔离文件');
  assert.strictEqual(fs.readFileSync(s.quarantined, 'utf8'), broken, '残片内容要原样保留');

  s.set('ui', { theme: 'light' }); // 这次写入会覆盖主文件
  assert.strictEqual(
    fs.readFileSync(s.quarantined, 'utf8'),
    broken,
    '覆盖主文件后，残片仍然可读（这就是与旧行为的关键差别）'
  );
  assert.ok(
    JSON.parse(fs.readFileSync(file, 'utf8')).ui.theme === 'light',
    '主文件已被新内容重建'
  );
});

test('坏盘不会污染备份链：当前文件损坏时不写 bak-1', () => {
  const file = path.join(storeDir(), 'config.json');
  const s = new Store(file, { log: () => {} });
  s.set('instances', ['好的一版']);
  s.set('ui', {}); // bak-1 = 含 instances 的那一版
  const goodBak = fs.readFileSync(Store.backupPath(file, 1), 'utf8');

  fs.writeFileSync(file, 'not json at all', 'utf8');
  new Store(file, { log: () => {} }).set('ui', { theme: 'dark' });
  assert.strictEqual(
    fs.readFileSync(Store.backupPath(file, 1), 'utf8'),
    goodBak,
    'bak-1 应当还是那份好配置，而不是刚坏掉的内容'
  );
});

test('目录不存在时也能建起来（首次启动）', () => {
  const file = path.join(storeDir(), 'deep', 'nested', 'config.json');
  const s = new Store(file, { log: () => {} });
  s.set('instances', []);
  assert.ok(fs.existsSync(file));
});

test('文件不存在 → 空配置，且不产生隔离文件', () => {
  const file = path.join(storeDir(), 'config.json');
  const s = new Store(file, { log: () => {} });
  assert.deepStrictEqual(s.all(), {});
  assert.strictEqual(s.quarantined, null);
  assert.strictEqual(s.readError, null, 'ENOENT 不算错误');
});

test('get 的兜底值只在键不存在时生效', () => {
  const file = path.join(storeDir(), 'config.json');
  fs.writeFileSync(file, JSON.stringify({ a: null, b: 0 }), 'utf8');
  const s = new Store(file, { log: () => {} });
  assert.strictEqual(s.get('a', 'fallback'), null, '键在但值是 null → 返回 null');
  assert.strictEqual(s.get('b', 9), 0);
  assert.strictEqual(s.get('missing', 'fallback'), 'fallback');
});

test('parseObject 只认「对象」，数组 / null / 标量都不算配置', () => {
  assert.deepStrictEqual(Store.parseObject('{"a":1}'), { a: 1 });
  assert.strictEqual(Store.parseObject('[1,2]'), null);
  assert.strictEqual(Store.parseObject('null'), null);
  assert.strictEqual(Store.parseObject('"str"'), null);
  assert.strictEqual(Store.parseObject('42'), null);
  assert.strictEqual(Store.parseObject('{oops'), null);
  assert.strictEqual(Store.parseObject(''), null);
});

test('备份 / 残片文件名可预期（便于用户手工抢救）', () => {
  assert.ok(Store.backupPath('/x/config.json', 1).endsWith('config.json.bak-1'));
  assert.ok(Store.quarantinePath('/x/config.json').startsWith('/x/config.json.corrupt-'));
  const fixed = Store.quarantinePath('/x/config.json', new Date('2026-09-24T05:31:02.123Z'));
  assert.strictEqual(fixed, '/x/config.json.corrupt-2026-09-24T05-31-02-123Z', '时间戳里不留冒号（Windows 文件名禁用）');
});

test('写失败不抛异常（目录被占）', () => {
  const s = new Store(path.join(storeDir(), 'config.json'), {
    log: () => {},
    fs: {
      readFileSync: () => {
        throw Object.assign(new Error('nope'), { code: 'EACCES' });
      },
      mkdirSync: () => {},
      writeFileSync: () => {
        throw new Error('EACCES');
      },
      renameSync: () => {},
      existsSync: () => false,
      rmSync: () => {},
    },
  });
  assert.doesNotThrow(() => s.set('a', 1));
  assert.strictEqual(s.get('a'), 1, '内存里仍然生效');
});

suite('bin/cli · 参数解析（--version / --help）');

test('--version 与 -v 都只要版本，不启动应用', () => {
  assert.strictEqual(cli.parseArgs(['--version']).action, 'version');
  assert.strictEqual(cli.parseArgs(['-v']).action, 'version');
  assert.strictEqual(cli.parseArgs(['-V']).action, 'version');
});

test('--help / -h / help 都只要用法', () => {
  assert.strictEqual(cli.parseArgs(['--help']).action, 'help');
  assert.strictEqual(cli.parseArgs(['-h']).action, 'help');
  assert.strictEqual(cli.parseArgs(['help']).action, 'help');
});

test('应用自己的开关原样透传（--demo / --selftest 不受影响）', () => {
  assert.deepStrictEqual(cli.parseArgs(['--demo', '--demo-zone=4']).passthrough, [
    '--demo',
    '--demo-zone=4',
  ]);
  assert.strictEqual(cli.parseArgs([]).action, 'run');
  assert.deepStrictEqual(cli.parseArgs([]).passthrough, []);
});

test('`--` 之后的 --version 是字面量，不再被当成选项', () => {
  const got = cli.parseArgs(['--', '--version']);
  assert.strictEqual(got.action, 'run');
  assert.deepStrictEqual(got.passthrough, ['--version']);
});

test('版本行与用法里都不留没替换的占位符', () => {
  assert.match(cli.versionText(), /^dsh-multi-instance \d+\.\d+\.\d+\n$/);
  const help = cli.helpText();
  for (const bad of ['<repo>', 'undefined', 'NaN', '[object']) {
    assert.ok(!help.includes(bad), `用法里不该出现 ${bad}`);
  }
  assert.ok(help.includes('--selftest'), '用法里要列出自检开关');
  assert.ok(help.includes(cli.VERSION), '用法里要带版本号');
});

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
