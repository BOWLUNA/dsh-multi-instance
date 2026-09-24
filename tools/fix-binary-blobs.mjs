#!/usr/bin/env node
/**
 * 修复二进制文件被 UTF-8 转义损坏的问题。
 *
 * 背景：push-via-github-api.mjs 把文件按 utf8 读进来再建 blob，
 * 二进制里任何非法的 UTF-8 字节序列会被替换成 U+FFFD（EF BF BD），
 * 于是 PNG/ICO 全部损坏。实测 header.png 从 75533B 涨到 132108B，
 * 文件头 \x89 变成了 EF BF BD —— 图片直接打不开。
 *
 * 这个脚本用 **base64** 重建这些 blob（Git Data API 的二进制安全通道），
 * 逐字节还原。文本文件不碰（上次推的是对的）。
 *
 * 用法（在 WSL 里跑，gh 在 ~/.local/bin）：
 *   node fix-binary-blobs.mjs --repo <owner/name> --local <路径> [--dry-run]
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync, writeFileSync, mkdtempSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';

function arg(name, def = '') {
  const i = process.argv.indexOf('--' + name);
  if (i < 0) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : 'true';
}

const REPO = arg('repo');
const LOCAL = arg('local');
const DRY = arg('dry-run') === 'true';
if (!REPO || !LOCAL) {
  console.error('用法: node fix-binary-blobs.mjs --repo <owner/name> --local <路径> [--dry-run]');
  process.exit(1);
}

const TMP = mkdtempSync(path.join(tmpdir(), 'ghfix-'));

// gh 不一定在 PATH 上（在 WSL 里是 ~/.local/bin/gh）—— 先找一下
function findGh() {
  const cands = [
    process.env.GH_BIN,
    path.join(process.env.HOME || '', '.local/bin/gh'),
    '/usr/local/bin/gh',
    '/usr/bin/gh',
    'gh',
  ].filter(Boolean);
  for (const c of cands) {
    try {
      execFileSync(c, ['--version'], { stdio: 'ignore' });
      return c;
    } catch {
      /* 试下一个 */
    }
  }
  throw new Error('找不到 gh（设 GH_BIN 环境变量或把 gh 放进 PATH）');
}
const GH = findGh();

const gh = (...args) => execFileSync(GH, args, { maxBuffer: 128 * 1024 * 1024 }).toString('utf8');
const ghJson = (...args) => JSON.parse(gh(...args) || 'null');
/** 把 JSON 通过临时文件喂给 gh（避免 stdin 转义与命令行长度问题） */
function ghPost(endpoint, obj) {
  const f = path.join(TMP, 'body-' + Math.random().toString(36).slice(2) + '.json');
  writeFileSync(f, JSON.stringify(obj), 'utf8');
  return ghJson('api', '-X', 'POST', endpoint, '--input', f);
}

/** git 的 blob sha：sha1("blob <len>\0" + bytes) */
const blobSha = (buf) =>
  createHash('sha1')
    .update(Buffer.from(`blob ${buf.length}\0`, 'utf8'))
    .update(buf)
    .digest('hex');

const BINARIES = [
  'build/icon.ico',
  'build/icon.png',
  'docs/_old/header-v0.2.0.png',
  'docs/images/02-sidebar.png',
  'docs/images/03-tile.png',
  'docs/images/04-zone.png',
  'docs/images/05-many.png',
  'docs/images/06-instance.png',
  'docs/images/08-install.png',
  'docs/images/09-dark.png',
  'docs/images/header.png',
];

console.log(`仓库: ${REPO}`);
console.log(`本地: ${LOCAL}\n`);

const ref = ghJson('api', `repos/${REPO}/git/ref/heads/main`);
const headSha = ref.object.sha;
console.log(`远端 main = ${headSha.slice(0, 12)}\n`);

const fixes = [];
for (const rel of BINARIES) {
  const abs = path.join(LOCAL, rel);
  let buf;
  try {
    buf = readFileSync(abs);
  } catch {
    console.log(`  - ${rel.padEnd(34)} 本地没有，跳过`);
    continue;
  }
  const want = blobSha(buf);
  let have = '';
  try {
    have = ghJson('api', `repos/${REPO}/contents/${rel}?ref=main`).sha || '';
  } catch {
    have = '(缺失)';
  }
  const ok = have === want;
  console.log(
    `  ${ok ? '✓' : '✗'} ${rel.padEnd(34)} 远端=${have.slice(0, 12)} 本地=${want.slice(0, 12)} ${(statSync(abs).size / 1024).toFixed(0)}KB`
  );
  if (!ok) fixes.push({ rel, buf });
}

if (!fixes.length) {
  console.log('\n全部一致，无需修复。');
  process.exit(0);
}
console.log(`\n${fixes.length} 个文件需要修复`);

if (DRY) {
  console.log('--dry-run：未动远端。');
  process.exit(0);
}

// 1) 逐个建 blob（base64 —— 二进制安全）
const tree = [];
for (const { rel, buf } of fixes) {
  const blob = ghPost(`repos/${REPO}/git/blobs`, {
    content: buf.toString('base64'),
    encoding: 'base64',
  });
  tree.push({ path: rel, mode: '100644', type: 'blob', sha: blob.sha });
  console.log(`  blob ${rel} -> ${blob.sha.slice(0, 12)}`);
}

// 2) 建 tree（base_tree 保留远端其它文件）
const newTree = ghPost(`repos/${REPO}/git/trees`, {
  base_tree: headSha,
  tree,
});
console.log(`\ntree = ${newTree.sha.slice(0, 12)}`);

// 3) 建 commit（parent = 远端当前 main，所以是快进，不需要 force）
const commit = ghPost(`repos/${REPO}/git/commits`, {
  message: 'fix: 还原被 UTF-8 转义损坏的 PNG/ICO（改用 base64 通道重建 blob）',
  tree: newTree.sha,
  parents: [headSha],
});
console.log(`commit = ${commit.sha.slice(0, 12)}`);

// 4) 快进 ref
const upd = ghPost(`repos/${REPO}/git/refs/heads/main`, { sha: commit.sha, force: false });
console.log(`ref 更新 -> ${(upd.object && upd.object.sha ? upd.object.sha : '?').slice(0, 12)}`);
console.log('\n完成。');
