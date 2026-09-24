'use strict';

/**
 * 极简 JSON 配置存储。落盘位置由主进程指定（`<userData>/config.json`）。
 *
 * ── 为什么不止「读 + 写」 ───────────────────────────────────────────────
 * 这个文件装的是**用户唯一的资产**：实例列表 + 窗格排布。它没有云端副本，
 * 丢了就是丢了 —— 而 0.3.0 之前已经因为「落点漂移」丢过一次（见 appdata.js）。
 * 所以写入路径按「假设磁盘随时会坏」来设计：
 *
 *   1. **原子写**（先写 `.tmp` 再 rename）—— 写到一半断电不会留半截文件；
 *   2. **写前轮转备份** `<file>.bak-1..N` —— 每次成功覆盖前，把**能解析的**旧内容留一份；
 *   3. **损坏隔离**：读不出来时，先把残片原地保留成 `<file>.corrupt-<时间戳>`，
 *      再从最近的备份回退，并**把回退结果写回主文件**（自愈）；
 *   4. 全程不抛异常 —— 存储坏掉可以降级，启动不能被它拦住。
 *
 * 触发这套逻辑的真实场景不是理论：0.4.0 之前的 `_read()` 读失败只会打一行日志、
 * 返回 `{}`，而**紧接着任何一次 `set()` 都会用这份空配置把原始文件覆盖掉** ——
 * 探针实测：残片 32 字节 → 被覆盖成 38 字节的新文件，目录里没有任何备份可回退。
 */

const fs = require('fs');
const path = require('path');

/** 保留几份历史备份。3 份足够覆盖「连续几次误操作/坏盘」的回退需求，也不会撑爆目录。 */
const BACKUP_KEEP = 3;

/** 备份文件路径：`config.json.bak-1`（1 最新） */
function backupPath(file, n) {
  return `${file}.bak-${n}`;
}

/** 损坏文件的隔离路径：`config.json.corrupt-2026-09-24T05-31-02-123Z` */
function quarantinePath(file, when = new Date()) {
  const stamp = when.toISOString().replace(/[:.]/g, '-');
  return `${file}.corrupt-${stamp}`;
}

class Store {
  /**
   * @param {string} file 配置文件绝对路径
   * @param {object} [opts]
   * @param {object} [opts.fs]   注入的 fs（测试用）
   * @param {Function} [opts.log] 日志回调，收到 `[store] ...` 一行
   * @param {boolean}  [opts.backup=true] 是否启用写前备份
   */
  constructor(file, opts = {}) {
    this.file = file;
    this.fs = opts.fs || fs;
    this.log = typeof opts.log === 'function' ? opts.log : (msg) => console.error(msg);
    this.backup = opts.backup !== false;

    /** 这次读取是否用到了损坏回退；`null` 表示没发生。诊断用。 */
    this.recoveredFrom = null;
    /** 损坏残片被保留到哪；`null` 表示没发生。 */
    this.quarantined = null;
    this.readError = null;

    this.data = this._read();
  }

  // ------------------------------------------------------------ 读

  _read() {
    let raw;
    try {
      raw = this.fs.readFileSync(this.file, 'utf8');
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // 读不动（权限、被占用）：不动磁盘上的任何东西，按空配置继续
        this.readError = err.message;
        this.log(`[store] 配置读不出来（按空配置继续）: ${err.message}`);
      }
      return {};
    }

    const parsed = parseObject(raw);
    if (parsed) return parsed;

    // 走到这里：文件在，但内容不是合法的 JSON 对象 —— 这是「会丢数据」的那条路
    this.readError = 'JSON 解析失败';
    this._quarantine(raw);
    return this._recoverFromBackup() || {};
  }

  /**
   * 把损坏的残片原样留一份。
   * 用 writeFileSync 而不是 rename：万一这是用户唯一的数据，别把它从原位置挪走 ——
   * 后续 `_recoverFromBackup()` 会重建主文件，两件事互不干扰。
   */
  _quarantine(raw) {
    const dest = quarantinePath(this.file);
    try {
      this.fs.writeFileSync(dest, raw, 'utf8');
      this.quarantined = dest;
      this.log(
        `[store] 配置损坏，残片已保留: ${path.basename(dest)}（${Buffer.byteLength(raw, 'utf8')} 字节）`
      );
    } catch (err) {
      this.log(`[store] 保留损坏残片失败: ${err.message}`);
    }
  }

  /** 从最新到最旧找第一份能解析的备份，并把它写回主文件（自愈）。 */
  _recoverFromBackup() {
    if (!this.backup) return null;
    for (let i = 1; i <= BACKUP_KEEP; i += 1) {
      const file = backupPath(this.file, i);
      let raw;
      try {
        raw = this.fs.readFileSync(file, 'utf8');
      } catch {
        continue;
      }
      const parsed = parseObject(raw);
      if (!parsed) continue;
      try {
        this.fs.writeFileSync(this.file, raw, 'utf8');
      } catch (err) {
        this.log(`[store] 回退写回失败（仍在内存里生效）: ${err.message}`);
      }
      this.recoveredFrom = file;
      this.log(`[store] 已从 ${path.basename(file)} 回退配置并写回主文件`);
      return parsed;
    }
    this.log('[store] 没有任何可用备份，按空配置继续（残片已保留，可手工抢救）');
    return null;
  }

  // ------------------------------------------------------------ 读/写接口

  get(key, fallback) {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    this._write();
    return value;
  }

  all() {
    return { ...this.data };
  }

  // ------------------------------------------------------------ 写

  _write() {
    this._rotateBackups();
    const json = JSON.stringify(this.data, null, 2);
    try {
      this.fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // 先写临时文件再 rename，避免半截文件
      const tmp = this.file + '.tmp';
      this.fs.writeFileSync(tmp, json, 'utf8');
      this.fs.renameSync(tmp, this.file);
      return true;
    } catch (err) {
      this.log(`[store] 写入失败: ${err.message}`);
      return false;
    }
  }

  /**
   * 写前把当前文件推进备份链：bak-2 → bak-3，bak-1 → bak-2，当前 → bak-1。
   * ★ 只备份**能解析的**内容 —— 否则一次坏盘会把好备份一路挤掉，
   *   反而让「回退」回退到一个同样坏的文件上。
   */
  _rotateBackups() {
    if (!this.backup) return [];
    const f = this.fs;
    const file = this.file;

    let current;
    try {
      current = f.readFileSync(file, 'utf8');
    } catch {
      return []; // 还没有主文件（首次写入）
    }
    if (!parseObject(current)) return [];

    const moved = [];
    try {
      f.rmSync(backupPath(file, BACKUP_KEEP), { force: true });
    } catch {
      /* 最老那份删不掉也不是问题，后面 rename 会覆盖 */
    }
    for (let i = BACKUP_KEEP - 1; i >= 1; i -= 1) {
      const src = backupPath(file, i);
      const dst = backupPath(file, i + 1);
      try {
        if (!f.existsSync(src)) continue;
        f.rmSync(dst, { force: true });
        f.renameSync(src, dst);
        moved.push(dst);
      } catch (err) {
        this.log(`[store] 备份轮转失败（继续写主文件）: ${err.message}`);
      }
    }
    try {
      f.writeFileSync(backupPath(file, 1), current, 'utf8');
    } catch (err) {
      this.log(`[store] 备份写入失败（继续写主文件）: ${err.message}`);
    }
    return moved;
  }
}

/** JSON.parse 并确认是对象；不是就返回 null（数组/null/标量都不算配置）。 */
function parseObject(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// 挂在类上导出：`Store` 本身仍是构造函数（`new Store(file)` 不变），
// 但常量与纯函数能单独拿出来测。
Store.BACKUP_KEEP = BACKUP_KEEP;
Store.backupPath = backupPath;
Store.quarantinePath = quarantinePath;
Store.parseObject = parseObject;

module.exports = Store;
