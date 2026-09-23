'use strict';

/**
 * DSH 实例自动发现
 *
 * 两个维度都要覆盖：
 *   A. 已经装好、正在跑  → 扫进程/端口，能拿到端口
 *   B. 已经装好、没启动  → 扫 dsh 可执行文件与 npm 全局目录，能拿到 bin 路径
 *      （用户明确要求：装了没启的也要能发现）
 *
 * 判定「这是不是 DSH 服务」的可靠特征（实测）：
 *   无 token → 401 + body 含 "dsh web authentication required"
 *   有 token → 303 + set-cookie 含 "dsh-auth-"
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawn } = require('child_process');

const inst = require('./instances');

const SCAN_RANGES = [
  [3000, 3200],
  [7800, 7900],
  [8000, 8100],
];

function inScanRange(port) {
  return SCAN_RANGES.some(([a, b]) => port >= a && port <= b);
}

function runCapture(command, args, timeout = 15000) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let done = false;
    const finish = (r) => {
      if (!done) {
        done = true;
        resolve(r);
      }
    };
    let child;
    try {
      child = spawn(command, args, {
        windowsHide: true,
        // cmd.exe 不认 Node 默认的 \" 转义 —— 命令里带引号就会被拆错
        windowsVerbatimArguments: /cmd\.exe$/i.test(command),
      });
    } catch (e) {
      return finish({ ok: false, error: e.message });
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch { /* ignore */ }
      finish({ ok: false, error: 'timeout', stdout: out, stderr: err });
    }, timeout);
    child.stdout.on('data', (d) => {
      out += d.toString('utf8');
    });
    child.stderr.on('data', (d) => {
      err += d.toString('utf8');
    });
    child.on('error', (e) => {
      clearTimeout(timer);
      finish({ ok: false, error: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ ok: code === 0, code, stdout: out, stderr: err });
    });
  });
}

async function runWslCapture(distro, user, script, timeout = 15000) {
  const args = ['-d', distro];
  // user 为空就不要带 -u：带个空串 wsl.exe 会直接报错，整轮扫描全废
  if (user && String(user).trim()) args.push('-u', String(user).trim());
  args.push('--exec', 'bash', '-lc', script);
  return runCapture('wsl.exe', args, timeout);
}

// ---------------------------------------------------------------- 运行态

/** 抓一个端口的 HTTP 响应，判断是不是 DSH */
function probeDsh(port, host = '127.0.0.1', timeout = 1500) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };

    const req = http.request(
      {
        method: 'GET',
        hostname: host,
        port,
        path: '/',
        timeout,
        headers: { 'User-Agent': 'DSH-Shell/0.2 (+discover)' },
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 4096) body = body.slice(0, 4096);
          if (/dsh web authentication required/i.test(body)) {
            res.destroy();
            done({ isDsh: true, status: res.statusCode, needsToken: true });
          }
        });
        res.on('end', () => {
          const cookie = String(res.headers['set-cookie'] || '');
          done({
            isDsh: /dsh-auth-/i.test(cookie),
            status: res.statusCode,
            needsToken: res.statusCode === 401,
          });
        });
        res.on('error', () => done({ isDsh: false, status: res.statusCode }));
      }
    );

    req.on('timeout', () => {
      req.destroy();
      done({ isDsh: false, error: 'timeout' });
    });
    req.on('error', (err) => done({ isDsh: false, error: err.code || err.message }));
    req.end();
  });
}

/** Windows 上监听的端口 */
function windowsListeningPorts() {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn('netstat', ['-ano'], { windowsHide: true });
    } catch {
      return resolve([]);
    }
    child.stdout.on('data', (d) => {
      out += d.toString('utf8');
    });
    child.on('error', () => resolve([]));
    child.on('close', () => {
      const ports = new Set();
      for (const line of out.split(/\r?\n/)) {
        if (!/LISTENING/i.test(line)) continue;
        const m = line.match(/(?:127\.0\.0\.1|0\.0\.0\.0|\[::\]|\[::1\]):(\d+)\s/);
        if (!m) continue;
        const p = Number(m[1]);
        if (inScanRange(p)) ports.add(p);
      }
      resolve([...ports]);
    });
  });
}

/**
 * WSL 里跑着的 dsh web 进程 → [{bin, port}]
 * bin 同样做 readlink 归一化，才能和「安装态」扫出来的路径对上号。
 */
async function wslDshProcesses(distro, user) {
  const script = [
    "ps -eo args 2>/dev/null | grep -E '[b]in/dsh +web' | head -20 | while read -r line; do",
    '  bin=$(printf %s "$line" | awk \'{for(i=1;i<=NF;i++) if ($i ~ /bin\\/dsh$/) {print $i; exit}}\')',
    '  port=$(printf %s "$line" | grep -oE "\\-\\-port[= ][0-9]+" | grep -oE "[0-9]+" | head -1)',
    '  if [ -n "$bin" ]; then echo "$(readlink -f "$bin")|${port:-3080}"; fi',
    'done',
  ].join('\n');

  const r = await runWslCapture(distro, user, script, 12000);
  const found = [];
  for (const line of String(r.stdout || '').split(/\r?\n/)) {
    const parts = line.trim().split('|');
    if (parts.length !== 2) continue;
    const bin = parts[0].trim();
    const port = Number(parts[1].trim().replace(/\0/g, '')) || 3080;
    if (!bin.startsWith('/')) continue;
    found.push({ bin, port });
  }
  return found;
}

function listDistros() {
  return new Promise((resolve) => {
    let out = '';
    let child;
    try {
      child = spawn('wsl.exe', ['-l', '-q'], { windowsHide: true });
    } catch {
      return resolve([]);
    }
    child.stdout.on('data', (d) => {
      out += d.toString('utf16le'); // wsl -l 输出为 UTF-16LE
    });
    child.on('error', () => resolve([]));
    child.on('close', () => {
      const names = out
        .split(/\r?\n/)
        .map((s) => s.replace(/\0/g, '').trim())
        .filter(Boolean);
      resolve(names);
    });
  });
}

// ---------------------------------------------------------------- 安装态（装了没启动）

/**
 * 在 WSL 里找 dsh 可执行文件与 npm 全局包目录。
 *
 * 关键：同一份安装常有多条路径（PATH 里的软链、npm prefix、node 版本目录），
 * 所以一律用 `readlink -f` 归一化后再去重，否则一个 DSH 会报成四五个。
 */
async function scanInstalledWsl(distro, user) {
  const script = [
    'echo @@BINS',
    'for p in "$(command -v dsh 2>/dev/null)" "$HOME/.local/bin/dsh"; do [ -n "$p" ] && [ -e "$p" ] && readlink -f "$p"; done',
    'P="$(npm prefix -g 2>/dev/null)"; [ -n "$P" ] && [ -e "$P/bin/dsh" ] && readlink -f "$P/bin/dsh"',
    'echo @@DIRS',
    'ls -d "$HOME/.local/share/nodejs"/*/lib/node_modules/@deepseek-ai/dsh 2>/dev/null || true',
    'ls -d "$HOME/.nvm/versions/node"/*/lib/node_modules/@deepseek-ai/dsh 2>/dev/null || true',
    'ls -d /usr/lib/node_modules/@deepseek-ai/dsh /usr/local/lib/node_modules/@deepseek-ai/dsh 2>/dev/null || true',
    'echo @@END',
  ].join('; ');

  const r = await runWslCapture(distro, user, script, 20000);
  const text = String(r.stdout || '');
  if (!text) return [];

  const section = (name) => {
    const m = text.split(`@@${name}`)[1];
    if (m === undefined) return '';
    return m.split('@@')[0];
  };

  const lines = (s) =>
    s
      .split(/\r?\n/)
      .map((x) => x.replace(/\0/g, '').trim())
      .filter((x) => x && x.startsWith('/'));

  const seen = new Set();
  const out = [];

  for (const b of lines(section('BINS'))) {
    if (seen.has(b)) continue;
    seen.add(b);
    out.push({ bin: b, target: 'wsl', distro, user });
  }

  // 只有完全找不到可执行文件时，才退而报包目录
  if (!out.length) {
    for (const d of lines(section('DIRS'))) {
      if (seen.has(d)) continue;
      seen.add(d);
      out.push({ dir: d, target: 'wsl', distro, user });
    }
  }

  return out;
}

/** Windows 侧：where dsh + npm 全局目录 + 常见位置 */
async function scanInstalledWindows() {
  const script = [
    'echo @@WHERE',
    'where dsh 2>nul',
    'echo @@PREFIX',
    'call npm prefix -g 2>nul',
    'echo @@END',
  ].join(' & ');

  const r = await runCapture('cmd.exe', ['/d', '/s', '/c', script], 20000);
  const text = String(r.stdout || '');
  const section = (name) => {
    const m = text.split(`@@${name}`)[1];
    return m === undefined ? '' : m.split('@@')[0];
  };

  const bins = new Set();
  const dirs = new Set();

  section('WHERE')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && /dsh/i.test(s) && !s.startsWith('@@'))
    .forEach((b) => bins.add(b));

  const prefix = section('PREFIX')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s && /[\\/]/.test(s) && !s.startsWith('@@'))[0];

  const candidates = [];
  if (prefix) {
    candidates.push(path.win32.join(prefix, 'node_modules', '@deepseek-ai', 'dsh'));
    bins.add(path.win32.join(prefix, 'dsh.cmd'));
  }
  const appData = process.env.APPDATA || '';
  if (appData) {
    candidates.push(path.win32.join(appData, 'npm', 'node_modules', '@deepseek-ai', 'dsh'));
    bins.add(path.win32.join(appData, 'npm', 'dsh.cmd'));
  }
  candidates.push('C:\\Program Files\\nodejs\\node_modules\\@deepseek-ai\\dsh');

  // 去重（Windows 路径大小写不敏感），并且优先报可执行文件
  const seen = new Set();
  const out = [];
  for (const b of bins) {
    const key = String(b).toLowerCase();
    if (seen.has(key)) continue;
    try {
      if (fs.existsSync(b)) {
        seen.add(key);
        out.push({ bin: b, target: 'windows' });
      }
    } catch { /* ignore */ }
  }

  if (!out.length) {
    for (const d of candidates) {
      const key = String(d).toLowerCase();
      if (seen.has(key)) continue;
      try {
        if (fs.existsSync(path.win32.join(d, 'package.json'))) {
          seen.add(key);
          out.push({ dir: d, target: 'windows' });
        }
      } catch { /* ignore */ }
    }
  }

  return out;
}

/** 读 dsh 版本（顺带验证这个 bin 真能跑） */
async function readVersion(item) {
  if (!item) return '';
  if (item.target === 'wsl') {
    const bin = item.bin || `${String(item.dir).replace(/\/+$/, '')}/bin/dsh`;
    // 归一化后的 bin 可能是个 .js，直接执行未必有权限，退一步用 node 跑
    const script = `"{0}" --version 2>/dev/null | head -1 || node "{0}" --version 2>/dev/null | head -1`.replace(
      /\{0\}/g,
      bin
    );
    const r = await runWslCapture(item.distro, item.user, script, 20000);
    const m = String(r.stdout || '').match(/\d+\.\d+\.\d+[\w.-]*/);
    return m ? m[0] : '';
  }
  const bin = item.bin || path.win32.join(item.dir, 'dsh.cmd');
  const r = await runCapture('cmd.exe', ['/d', '/s', '/c', `"${bin}" --version 2>&1`], 20000);
  const m = ((r.stdout || '') + (r.stderr || '')).match(/\d+\.\d+\.\d+[\w.-]*/);
  return m ? m[0] : '';
}

// ---------------------------------------------------------------- 汇总

/**
 * 全量发现。
 * @returns {Promise<Array>} 候选：[{key,target,port?,bin?,version?,running,where,title,sub,already}]
 */
/**
 * 用户可能把 DSH 装成什么样？目录名撞名规则（大小写不敏感）：
 * DeepSeek Harness / DeepSeekHarness / deepseek-harness / DSH / dsh-1 ...
 */
const DIR_NAME_RE = /deepseek[\s._-]*harness|^dsh$|^dsh[._-]|[_./-]dsh$/i;

/** 硬证据：真装过 DSH 的目录里一定躺着它（撞名只是线索，这个才是判据） */
const DSH_PKG = path.join('node_modules', '@deepseek-ai', 'dsh', 'package.json');

/**
 * 剪枝名单 —— 探进去既慢又几乎不可能放 DSH。
 * 有了它，扫「用户目录 + 各盘根」实测只要 100ms 量级。
 */
const SKIP_DIRS = new Set([
  '$recycle.bin', 'system volume information', 'windows', 'winsxs',
  '$winreagent', 'recovery', 'perflogs', 'msocache', 'onedrivetemp',
  'node_modules', '.git', '.svn', '.hg', '.cache', '.npm', '.cargo', '.rustup',
  '.vscode', '.gradle', '.m2', '.conda', '.venv', 'venv', '__pycache__',
  'appdata', 'application data', 'temp', 'tmp',
]);

/** 用户目录下优先探这些（放项目的地方） */
const HOT_SUBDIRS = [
  'desktop', 'documents', 'downloads', 'projects', 'project', 'code', 'dev',
  'src', 'work', 'workspace', 'repos', 'repo', 'git', 'github', 'ai', 'apps', 'app',
];

/**
 * 扫「常见位置」找 DSH 安装目录。
 *
 * 刻意**不全盘扫描**：全盘要跑很久，而且会翻到用户的私人文件。
 * 这里只走：用户目录（深度 4，优先热门子目录）+ 各盘根（深度 2），
 * 撞名只是线索 —— 必须找到 node_modules/@deepseek-ai/dsh/package.json 才算数。
 *
 * @returns {{found: Array, stat: {dirs:number, hits:number, pruned:number, ms:number, truncated:boolean}}}
 */
async function scanCommonDirs({ maxDepth = 4, budgetMs = 9000 } = {}) {
  const t0 = Date.now();
  const stat = { dirs: 0, hits: 0, pruned: 0, ms: 0, truncated: false };
  const found = [];

  // 根：用户目录 + 各盘根
  const roots = [];
  try {
    roots.push({ dir: os.homedir(), depth: maxDepth });
  } catch { /* ignore */ }
  for (const letter of 'CDEFGH') {
    const root = `${letter}:\\`;
    try {
      if (fs.existsSync(root)) roots.push({ dir: root, depth: 2 });
    } catch { /* ignore */ }
  }

  const overBudget = () => Date.now() - t0 > budgetMs;

  async function record(dir) {
    // 撞名了还不够，得看到硬证据
    const pkgPath = path.join(dir, DSH_PKG);
    let ok = false;
    try {
      ok = fs.existsSync(pkgPath);
    } catch { /* ignore */ }
    if (!ok) {
      // 也接受 package.json 里 name 就是 @deepseek-ai/dsh（prefix 装法）
      try {
        const pj = path.join(dir, 'package.json');
        if (fs.existsSync(pj)) {
          const j = JSON.parse(fs.readFileSync(pj, 'utf8'));
          ok = j && j.name === '@deepseek-ai/dsh';
        }
      } catch { /* ignore */ }
    }
    if (!ok) return;

    const bin = path.join(dir, 'dsh.cmd');
    const binPs = path.join(dir, 'dsh.ps1');
    const realBin = fs.existsSync(bin) ? bin : fs.existsSync(binPs) ? binPs : '';
    if (!realBin) return;

    found.push({ dir, bin: realBin });
  }

  async function walk(dir, depth) {
    if (overBudget()) {
      stat.truncated = true;
      return;
    }
    if (depth <= 0) {
      stat.pruned += 1;
      return;
    }

    let ents;
    try {
      ents = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    const subdirs = [];
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      // 软链/junction 一律不跟 —— 会绕圈，也可能跳到网络路径
      if (e.isSymbolicLink && e.isSymbolicLink()) continue;

      stat.dirs += 1;
      const low = e.name.toLowerCase();
      if (SKIP_DIRS.has(low)) {
        stat.pruned += 1;
        continue;
      }

      const full = path.join(dir, e.name);
      if (DIR_NAME_RE.test(e.name)) {
        stat.hits += 1;
        await record(full);
      }
      subdirs.push(full);
    }

    for (const d of subdirs) await walk(d, depth - 1);
  }

  for (const { dir, depth } of roots) {
    // 用户目录：先热门子目录（快且命中率高），再整体兜一遍
    if (depth === maxDepth) {
      let ents = [];
      try {
        ents = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch { /* ignore */ }
      const hot = ents.filter(
        (e) => e.isDirectory() && HOT_SUBDIRS.includes(e.name.toLowerCase())
      );
      for (const e of hot) {
        const full = path.join(dir, e.name);
        if (DIR_NAME_RE.test(e.name)) {
          stat.hits += 1;
          await record(full);
        }
        await walk(full, depth - 1);
        if (overBudget()) break;
      }
    }
    await walk(dir, depth);
  }

  stat.ms = Date.now() - t0;
  return { found, stat };
}

async function discover({ existing = [] } = {}) {
  const results = [];
  // 留空 = 用该发行版的默认用户。写死用户名的话，换台机器就扫不到东西了。
  const wslUser = '';
  const distros = (await listDistros()).filter((d) => !/^docker-desktop/i.test(d));

  // ---------- A. 安装态 + 运行态（WSL） ----------
  for (const distro of distros) {
    const installed = await scanInstalledWsl(distro, wslUser);
    const running = await wslDshProcesses(distro, wslUser);

    // 去重：同一个 bin 只留一条
    const byBin = new Map();
    for (const it of installed) {
      const key = it.bin || it.dir;
      if (!byBin.has(key)) byBin.set(key, it);
    }

    for (const [key, it] of byBin) {
      const bin = it.bin || `${String(it.dir).replace(/\/+$/, '')}/bin/dsh`;
      const proc = running.find((p) => p.bin === bin);
      const version = await readVersion({ ...it, bin });
      results.push({
        key: `wslpkg:${bin}`,
        target: 'wsl',
        distro,
        user: wslUser,
        bin,
        dir: it.dir || '',
        version,
        running: !!proc,
        port: proc ? proc.port : null,
        where: 'wsl',
      });
    }

    // 有进程但找不到对应包（比如装在别处）→ 也报出来
    for (const p of running) {
      if (byBin.has(p.bin)) continue;
      results.push({
        key: `wslrun:${p.bin}`,
        target: 'wsl',
        distro,
        user: wslUser,
        bin: p.bin,
        version: '',
        running: true,
        port: p.port,
        where: 'wsl',
      });
    }
  }

  // ---------- B. 安装态（Windows） ----------
  const winPkgs = await scanInstalledWindows();
  for (const it of winPkgs) {
    const bin = it.bin || path.win32.join(it.dir, 'dsh.cmd');
    const version = await readVersion({ ...it, bin });
    results.push({
      key: `winpkg:${bin}`,
      target: 'windows',
      bin,
      dir: it.dir || '',
      version,
      running: false,
      port: null,
      where: 'local',
    });
  }

  // ---------- C. 只是有服务在跑（Windows 侧端口） ----------
  const winPorts = await windowsListeningPorts();
  const CHUNK = 8;
  for (let i = 0; i < winPorts.length; i += CHUNK) {
    const slice = winPorts.slice(i, i + CHUNK);
    const probes = await Promise.all(slice.map((p) => probeDsh(p)));
    probes.forEach((r, k) => {
      if (!r.isDsh) return;
      const port = slice[k];
      const dup = results.find((x) => x.running && Number(x.port) === port);
      if (dup) return;
      // WSL2 mirrored 网络会让 WSL 服务也出现在 Windows 监听表里，
      // 这里只在没有任何 WSL 记录时才当作纯 Windows 服务
      const wslHas = results.some((x) => x.running && Number(x.port) === port);
      if (wslHas) return;
      results.push({
        key: `winrun:${port}`,
        target: 'windows',
        bin: '',
        version: '',
        running: true,
        port,
        where: 'local',
      });
    });
  }

  // ---------- C. 常见目录撞名扫描 ----------
  // 找「装在本地目录里」的 DSH（不在 PATH、也不是 npm 全局的那种）。
  // 只走常见位置 —— 全盘扫描既慢又会读到用户的私人文件。
  const dirScan = await scanCommonDirs();
  for (const hit of dirScan.found) {
    const key = `localdir:${hit.bin}`;
    if (results.some((r) => r.bin === hit.bin || r.key === key)) continue;
    const version = await readVersion({ target: 'windows', bin: hit.bin });
    results.push({
      key,
      target: 'windows',
      bin: hit.bin,
      dir: hit.dir,
      version,
      running: false,
      port: null,
      where: 'local',
    });
  }

  // ---------- 标注 & 修饰 ----------
  const list = results.map((c) => {
    const dup = existing.find(
      (e) =>
        (c.bin && e.dshBin && e.dshBin === c.bin) ||
        (Number(e.port) === Number(c.port) && e.target === c.target && c.running)
    );
    const isWsl = c.target === 'wsl';
    const title = c.running
      ? isWsl
        ? '本机 DSH · WSL2'
        : '本机 DSH · Windows'
      : isWsl
        ? '本机 DSH（已安装）'
        : '本机 DSH · Windows（已安装）';

    const bits = [];
    if (c.version) bits.push(`v${c.version}`);
    if (c.running) {
      bits.push(`运行中 · 127.0.0.1:${c.port}`);
    } else {
      bits.push('已安装 · 未启动');
    }

    return {
      ...c,
      title,
      sub: isWsl && c.distro ? `${c.distro} · ${bits.join(' · ')}` : bits.join(' · '),
      already: !!dup,
    };
  });

  return { list, scan: dirScan.stat };
}

module.exports = {
  discover,
  probeDsh,
  listDistros,
  wslDshProcesses,
  windowsListeningPorts,
  scanInstalledWsl,
  scanInstalledWindows,
  scanCommonDirs,
  runCapture,
  runWslCapture,
};
