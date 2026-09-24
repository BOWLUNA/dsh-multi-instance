'use strict';

/**
 * 用户数据落点：**固定目录名 + 一次性迁移**。
 *
 * 为什么需要这个模块：
 *
 * 1. Electron 的 `app.getPath('userData')` 默认等于 `<appData>/<app.getName()>`，
 *    而 `app.getName()` 在**开发态**取 `package.json` 的 `name`，
 *    在**打包态**取 electron-builder 的 `productName`。两者不同名就会落到不同目录 ——
 *    于是「开发时排好的布局」和「打包版用户的布局」在两个文件夹里，谁也看不见谁。
 *
 * 2. 这个项目改过三次名字（`dsh-shell` → `dsh-webview-desktop` → `dsh-multi-instance`），
 *    每改一次，旧目录里的 `config.json`（实例列表 + 窗格排布）就被静默丢掉，
 *    连 `Partitions/` 里持久化的登录态也一起留在原地。
 *
 * 结论：**落点必须自己钉死**，并且第一次启动时把旧目录里的东西接过来。
 * 本模块不依赖 electron，可直接用 Node 单测。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

/** 钉死的目录名。**不要**改这个名字 —— 一改就等于换了个新落点。 */
const APP_DIRNAME = 'dsh-multi-instance';

const CONFIG_FILE = 'config.json';

/**
 * 跟着一起搬的目录（都是「用户资产」，不是缓存）。
 * 刻意**不**搬 Cache / GPUCache / Code Cache / DawnXxxCache 之类 —— 那些是浏览器缓存，
 * 搬过来只会拖慢首次启动，价值为零。
 */
const CARRY_DIRS = ['Partitions'];

/**
 * 历史用过的目录名。顺序只影响「并列时的偏好」，真正的判据是 config.json 里有没有窗格。
 */
const LEGACY_DIRNAMES = [
  'DSH Multi-Instance', // 打包态的 productName
  'dsh-webview-desktop', // 第二次改名后的包名
  'dsh-shell', // 最早的包名
  'DSH套壳', // 早期中文目录名
];

/** 平台相关的 appData 根目录（与 Electron 的默认口径一致）。 */
function appDataRoot(env = process.env, platform = process.platform) {
  const home = env.HOME || env.USERPROFILE || os.homedir();
  if (platform === 'win32') {
    return env.APPDATA || path.join(home, 'AppData', 'Roaming');
  }
  if (platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support');
  }
  return env.XDG_CONFIG_HOME || path.join(home, '.config');
}

/** 钉死的 userData 目录。主进程拿它去 `app.setPath('userData', ...)`。 */
function resolveUserData(opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  return path.join(appDataRoot(env, platform), APP_DIRNAME);
}

/** 读一个 config.json；读不到或不是对象就返回 null。 */
function readConfig(file, fsImpl = fs) {
  try {
    const parsed = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** 配置里有几个窗格（数组长度）。空配置 / 坏配置一律算 0。 */
function paneCount(cfg) {
  return cfg && Array.isArray(cfg.panes) ? cfg.panes.length : 0;
}

/** 统计 legacy 目录，挑出最值得迁移的那一个。 */
function scanLegacy(opts = {}) {
  const env = opts.env || process.env;
  const platform = opts.platform || process.platform;
  const fsImpl = opts.fsImpl || fs;
  const target = opts.userData || resolveUserData({ env, platform });
  const root = path.dirname(target);
  const out = [];
  for (const name of LEGACY_DIRNAMES) {
    const dir = path.join(root, name);
    if (path.resolve(dir) === path.resolve(target)) continue;
    const configFile = path.join(dir, CONFIG_FILE);
    const cfg = readConfig(configFile, fsImpl);
    let mtime = 0;
    try {
      mtime = fsImpl.statSync(configFile).mtimeMs;
    } catch {
      /* 没有配置文件也算数：它可能带着 Partitions */
    }
    let exists = false;
    try {
      exists = fsImpl.statSync(dir).isDirectory();
    } catch {
      exists = false;
    }
    if (!exists) continue;
    out.push({
      name,
      dir,
      configFile,
      panes: paneCount(cfg),
      config: cfg,
      mtime,
      carry: CARRY_DIRS.filter((d) => {
        try {
          return fsImpl.statSync(path.join(dir, d)).isDirectory();
        } catch {
          return false;
        }
      }),
    });
  }
  return out;
}

/**
 * 只算不写：决定这次启动该不该迁移。
 * 返回 `{ action, ... }`，`action` 取值：
 *   'skip-target-ok'    目标目录已经有窗格 —— 什么都不做
 *   'skip-no-legacy'    没有任何旧目录 —— 什么都不做
 *   'skip-no-panes'     有旧目录，但里面也没有窗格 —— 不值得搬
 *   'migrate'           该搬
 */
function planMigration(opts = {}) {
  const userData = opts.userData || resolveUserData(opts);
  const fsImpl = opts.fsImpl || fs;
  const targetConfig = path.join(userData, CONFIG_FILE);
  const targetPanes = paneCount(readConfig(targetConfig, fsImpl));
  const legacy = scanLegacy({ ...opts, userData });

  const targetExists = fsImpl.existsSync(userData);

  if (targetPanes > 0) {
    return { action: 'skip-target-ok', userData, targetPanes, legacy, reason: '目标目录已有窗格' };
  }
  const withPanes = legacy.filter((l) => l.panes > 0);
  if (withPanes.length === 0) {
    return {
      action: legacy.length ? 'skip-no-panes' : 'skip-no-legacy',
      userData,
      targetPanes,
      legacy,
      targetExists,
      reason: legacy.length ? '旧目录里也没有窗格' : '没有旧目录',
    };
  }
  // 窗格多的优先；一样多就取 config.json 更新的那个
  withPanes.sort((a, b) => b.panes - a.panes || b.mtime - a.mtime);
  const from = withPanes[0];
  // 只有「连目录都还没建」时才搬运 Partitions：目标已经有会话了就别去覆盖
  const carry = targetExists && fsImpl.existsSync(path.join(userData, 'Partitions')) ? [] : from.carry;
  return {
    action: 'migrate',
    userData,
    targetPanes,
    legacy,
    from: from.dir,
    fromName: from.name,
    panes: from.panes,
    carry,
    reason: `${from.name} 里有 ${from.panes} 个窗格，目标目录只有 ${targetPanes} 个`,
  };
}

/** 执行迁移。任何一步失败都不抛 —— 启动不能被这件事拦住。 */
function applyMigration(plan, opts = {}) {
  const fsImpl = opts.fsImpl || fs;
  const logger = opts.logger || (() => {});
  if (!plan || plan.action !== 'migrate') {
    return { ok: true, action: plan ? plan.action : 'no-plan', copied: [] };
  }
  const copied = [];
  try {
    fsImpl.mkdirSync(plan.userData, { recursive: true });

    // config.json：先写临时文件再 rename，避免半截文件
    const raw = fsImpl.readFileSync(path.join(plan.from, CONFIG_FILE), 'utf8');
    JSON.parse(raw); // 校验过后才落盘
    const tmp = path.join(plan.userData, `${CONFIG_FILE}.migrating`);
    fsImpl.writeFileSync(tmp, raw, 'utf8');
    fsImpl.renameSync(tmp, path.join(plan.userData, CONFIG_FILE));
    copied.push(CONFIG_FILE);

    for (const name of plan.carry || []) {
      const src = path.join(plan.from, name);
      const dst = path.join(plan.userData, name);
      if (fsImpl.existsSync(dst)) continue; // 不覆盖已有会话
      fsImpl.cpSync(src, dst, { recursive: true, errorOnExist: false, force: false });
      copied.push(name);
    }
    logger(
      `[appdata] 已从 ${plan.fromName} 迁移: ${copied.join(', ')}（窗格 ${plan.panes} 个）`
    );
    return { ok: true, action: 'migrate', copied, from: plan.from };
  } catch (err) {
    logger(`[appdata] 迁移失败（忽略，按新目录启动）: ${err.message}`);
    return { ok: false, action: 'migrate', error: err.message, copied };
  }
}

/** 一步到位：解析落点 + 需要的话迁移。返回 `{ userData, plan, result }`。 */
function bootstrap(opts = {}) {
  const userData = opts.userData || resolveUserData(opts);
  let plan;
  try {
    plan = planMigration({ ...opts, userData });
  } catch (err) {
    const logger = opts.logger || (() => {});
    logger(`[appdata] 扫描旧目录失败（忽略）: ${err.message}`);
    plan = { action: 'skip-error', userData, error: err.message };
  }
  const result = applyMigration(plan, opts);
  return { userData, plan, result };
}

module.exports = {
  APP_DIRNAME,
  CONFIG_FILE,
  CARRY_DIRS,
  LEGACY_DIRNAMES,
  appDataRoot,
  resolveUserData,
  readConfig,
  paneCount,
  scanLegacy,
  planMigration,
  applyMigration,
  bootstrap,
};
