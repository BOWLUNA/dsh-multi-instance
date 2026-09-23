'use strict';

/**
 * 极简 JSON 配置存储。
 * 落盘位置由主进程指定（app.getPath('userData')/config.json）。
 */
const fs = require('fs');
const path = require('path');

class Store {
  constructor(file) {
    this.file = file;
    this.data = this._read();
  }

  _read() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.error('[store] 读取失败，按空配置处理:', err.message);
      }
      return {};
    }
  }

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

  _write() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      // 先写临时文件再 rename，避免半截文件
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] 写入失败:', err.message);
    }
  }
}

module.exports = Store;
