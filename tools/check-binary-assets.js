#!/usr/bin/env node
'use strict';

/**
 * 护栏：仓库里的图片资产必须**还是图片**。
 *
 * 来历：本项目曾把 README 的 PNG 与应用图标 ICO 当成文本处理过一次，
 * 文件内容被 UTF-8 转义改写、图全花了，只好写脚本重建 blob（见 commit d8eb824）。
 * `.gitattributes` 挡住了新文件，但挡不住已经进仓库的内容被再次改写 ——
 * 所以再加一道能自动跑的检查：读头几个字节，对不上magic number 就失败。
 *
 *   用法：  npm run check:assets
 *   判据：  PNG  → 89 50 4E 47 0D 0A 1A 0A
 *          ICO  → 00 00 01 00（也接受 PNG 头：electron-builder 的 .ico 常常是 PNG 转的容器）
 *   范围：  git 跟踪的 *.png / *.ico；没有 git 时就退化成遍历 build/ 与 docs/
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ICO_MAGIC = Buffer.from([0x00, 0x00, 0x01, 0x00]);

/** 收集要检查的文件：优先问 git（只看被跟踪的，忽略 dist/ 之类的产物） */
function collect() {
  try {
    const out = execFileSync('git', ['ls-files', '*.png', '*.ico'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const list = out.split(/\r?\n/).filter(Boolean);
    if (list.length) return list;
  } catch {
    /* 没有 git（或不在仓库里）：退化到目录遍历 */
  }
  const found = [];
  const walk = (dir, depth = 0) => {
    if (depth > 4) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      else if (/\.(png|ico)$/i.test(e.name)) found.push(path.relative(ROOT, full));
    }
  };
  walk(ROOT);
  return found;
}

function head(file, n = 8) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.alloc(n);
    const read = fs.readSync(fd, buf, 0, n, 0);
    return buf.subarray(0, read);
  } finally {
    fs.closeSync(fd);
  }
}

function looksLikeText(buf) {
  // 被文本化过的文件头通常是可见 ASCII（例如 "iVBORw0K" / "<svg" / "<?xml"）
  return buf.length > 0 && buf.every((b) => b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127));
}

function main() {
  const files = collect();
  const bad = [];
  for (const rel of files) {
    const file = path.join(ROOT, rel);
    let buf;
    try {
      buf = head(file);
    } catch (err) {
      bad.push({ rel, why: `读不出来：${err.message}` });
      continue;
    }
    const isPng = buf.subarray(0, 8).equals(PNG_MAGIC);
    const isIco = buf.subarray(0, 4).equals(ICO_MAGIC);

    if (/\.png$/i.test(rel)) {
      if (!isPng) {
        bad.push({
          rel,
          why: looksLikeText(buf)
            ? `像是文本（头 8 字节 = ${JSON.stringify(buf.toString('latin1'))}），PNG 头应为 89504e470d0a1a0a`
            : `头字节不对：${buf.toString('hex')}`,
        });
      }
    } else if (/\.ico$/i.test(rel)) {
      if (!isIco && !isPng) {
        bad.push({
          rel,
          why: looksLikeText(buf)
            ? `像是文本（头 8 字节 = ${JSON.stringify(buf.toString('latin1'))}）`
            : `既不是 ICO 也不是 PNG 容器：${buf.toString('hex')}`,
        });
      }
    }
  }

  process.stdout.write(`检查 ${files.length} 个图片资产\n`);
  if (!bad.length) {
    process.stdout.write('OK  全部是合法图片（没被当文本处理过）\n');
    return 0;
  }
  process.stdout.write(`FAIL 有 ${bad.length} 个文件不像图片：\n`);
  for (const b of bad) process.stdout.write(`  ${b.rel}\n    ${b.why}\n`);
  process.stdout.write('\n修法：从 git 历史里取回正确的内容重建 blob（见 tools/fix-binary-blobs.mjs）。\n');
  return 1;
}

if (require.main === module) process.exit(main());

module.exports = { collect, head, PNG_MAGIC, ICO_MAGIC, looksLikeText };
