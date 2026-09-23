'use strict';

/**
 * DSH 实例模型
 *
 * 一个实例描述「一处 DSH 怎么跑、怎么拿到访问地址、怎么起停」。
 *   target = 'wsl'     跑在 WSL2 里（默认场景）
 *   target = 'windows' 跑在 Windows 本机
 *   target = 'remote'  跑在服务器上，只有 URL
 *
 * 访问地址（带 token）的来源按优先级：
 *   1. inst.lastUrl（上次应用启动实例时捕获并持久化的地址）
 *   2. inst.urlFile（外部启动器写入的文件，例如 WSL 的 dsh-url.txt）
 *   3. 启动实例时从进程输出里现抓
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');

const HOME = os.homedir();
const LOCALAPPDATA = process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');

const URL_RE = /https?:\/\/[^\s"'<>]+/;
const DSH_URL_RE = /http:\/\/127\.0\.0\.1:(\d+)\/\?token=[A-Za-z0-9_-]+/;

const DEFAULT_URL_FILE = path.join(LOCALAPPDATA, 'dsh', 'dsh-url.txt');
// 用 $HOME 而不是写死 /home/<某人> —— 这行脚本是在 WSL 的 bash 里跑的，
// $HOME 会自动展开成那台机器的实际用户目录。
const WSL_HOME = '$HOME';
const WSL_START_SCRIPT = `${WSL_HOME}/.local/share/dsh/start-dsh.sh`;

/**
 * 首次启动的实例列表。
 *
 * **刻意返回空数组** —— 新用户不该看到任何"别人机器上的"实例。
 * 空列表会让界面显示引导，同时 main 会自动跑一次发现（见 main.js），
 * 找到什么就问用户要不要加。
 *
 * 这里曾经预置过三条：一条 WSL2 推断、两条我自己的服务器域名。
 * 那对别人毫无意义，而且会暴露我的私有信息 —— 开源前删掉了。
 */
function defaultInstances() {
  return [];
}

// ---------------------------------------------------------------- URL 解析

function applyToken(url, token) {
  const tk = (token || '').trim();
  if (!tk) return url;
  if (/[?&]token=/.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(tk);
}

function pickUrlFrom(text) {
  if (!text) return '';
  const m = String(text).match(DSH_URL_RE);
  if (m) return m[0];
  const g = String(text).match(URL_RE);
  return g ? g[0] : '';
}

function readFileText(file) {
  try {
    return { ok: true, text: fs.readFileSync(file, 'utf8') };
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: false, error: `文件不存在：${file}` };
    return { ok: false, error: `读取失败：${err.message}` };
  }
}

function runWsl(args, timeout = 12000) {
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
      child = spawn('wsl.exe', args, { windowsHide: true });
    } catch (e) {
      return finish({ ok: false, error: e.message });
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch { /* ignore */ }
      finish({ ok: false, error: '命令超时', stdout: out });
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

/** 组装 wsl.exe 参数。user 留空就用该发行版的默认用户。 */
function wslArgs(inst, script) {
  const args = ['-d', inst.distro || 'Ubuntu'];
  if (inst.user && String(inst.user).trim()) args.push('-u', String(inst.user).trim());
  args.push('--exec', 'bash', '-lc', script);
  return args;
}

/**
 * 取一个实例当前的候选访问地址（不做网络验证）。
 * 返回 { ok, url, from, error }
 */
async function resolveUrl(inst) {
  if (!inst) return { ok: false, error: '实例不存在' };

  if (inst.target === 'remote') {
    if (!inst.url) return { ok: false, error: '还没填地址' };
    return { ok: true, url: applyToken(String(inst.url).trim(), inst.token), from: 'config' };
  }

  const port = inst.port || 3080;

  // 1) 上次捕获的地址（端口要对得上，否则说明实例换过端口）
  if (inst.lastUrl) {
    const m = String(inst.lastUrl).match(/127\.0\.0\.1:(\d+)/);
    if (m && Number(m[1]) === Number(port)) {
      return { ok: true, url: inst.lastUrl, from: 'lastUrl' };
    }
  }

  // 2) 外部启动器写的地址文件
  if (inst.urlFile) {
    const r = readFileText(inst.urlFile);
    if (r.ok) {
      const u = pickUrlFrom(r.text);
      if (u) {
        const m = u.match(/127\.0\.0\.1:(\d+)/);
        if (!m || Number(m[1]) === Number(port)) {
          return { ok: true, url: u, from: 'urlFile' };
        }
      }
    }
  }

  // 3) 从日志文件里捞（WSL 侧读）
  if (inst.logFile) {
    if (inst.target === 'wsl') {
      const r = await runWsl(wslArgs(inst, `tail -n 80 "${inst.logFile}" 2>/dev/null`));
      if (r.ok) {
        const u = pickUrlFrom(r.stdout);
        if (u && new RegExp(`:${port}/`).test(u)) return { ok: true, url: u, from: 'wslLog' };
      }
    } else {
      const r = readFileText(inst.logFile);
      if (r.ok) {
        const u = pickUrlFrom(r.text);
        if (u) return { ok: true, url: u, from: 'log' };
      }
    }
  }

  return {
    ok: false,
    error: '还没有可用地址（实例可能没启动过）',
    needsStart: true,
  };
}

// ---------------------------------------------------------------- 探测

function probe(url, timeout = 7000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (r) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    let u;
    try {
      u = new URL(url);
    } catch {
      return done({ alive: false, error: 'URL 无法解析' });
    }
    if (!/^https?:$/.test(u.protocol)) return done({ alive: false, error: '只支持 http/https' });

    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        method: 'GET',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: (u.pathname || '/') + (u.search || ''),
        timeout,
        rejectUnauthorized: false,
        headers: { 'User-Agent': 'DSH-Shell/0.2 (+probe)' },
      },
      (res) => {
        res.resume();
        const status = res.statusCode || 0;
        done({
          alive: true,
          status,
          authRequired: status === 401 || status === 403,
          looksLikeDsh: /dsh|deepseek/i.test(String(res.headers['server'] || '') + String(res.headers['x-powered-by'] || '')),
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      done({ alive: false, error: `超时（${timeout}ms）` });
    });
    req.on('error', (err) => done({ alive: false, error: err.code || err.message }));
    req.end();
  });
}

/** 探头某个 TCP 端口是否有人监听（比 HTTP 探测便宜） */
function portOpen(port, host = '127.0.0.1', timeout = 900) {
  return new Promise((resolve) => {
    const net = require('net');
    const sock = new net.Socket();
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      sock.destroy();
      resolve(v);
    };
    sock.setTimeout(timeout);
    sock.once('connect', () => finish(true));
    sock.once('timeout', () => finish(false));
    sock.once('error', () => finish(false));
    sock.connect(port, host);
  });
}

// ---------------------------------------------------------------- 起停

/**
 * 组装启动命令。
 * 默认用 bash 把 dsh web 跑起来，并把它的输出接到我们这里（便于解析地址）。
 */
function buildStart(inst) {
  const port = inst.port || 3080;

  if (inst.target === 'remote') {
    return { ok: false, error: '远程实例不需要在本机启动' };
  }

  // 用户自定义命令行（占位符 {port} 会被替换）
  if (inst.launcher && inst.launcher.kind === 'command' && inst.launcher.command) {
    const cmd = String(inst.launcher.command).replace(/\{port\}/g, String(port));
    if (inst.target === 'wsl') {
      return { ok: true, command: 'wsl.exe', args: wslArgs(inst, cmd), shell: false };
    }
    return { ok: true, command: 'cmd.exe', args: ['/d', '/s', '/c', cmd], shell: false };
  }

  // 默认：直接用 dsh CLI 跑起来
  const bin = inst.dshBin || 'dsh';
  const script = `export PATH="$HOME/.local/bin:$PATH"; exec "${bin}" web --no-open --port ${port}`;

  if (inst.target === 'wsl') {
    return { ok: true, command: 'wsl.exe', args: wslArgs(inst, script), shell: false };
  }
  return {
    ok: true,
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', `"${bin}" web --no-open --port ${port}`],
    shell: false,
  };
}

/** 组装停止命令 */
function buildStop(inst) {
  const port = inst.port || 3080;
  if (inst.target === 'wsl') {
    return {
      command: 'wsl.exe',
      args: wslArgs(inst, `pkill -f "dsh web.*--port ${port}" 2>/dev/null; pkill -f "bin/dsh web" 2>/dev/null; exit 0`),
    };
  }
  return {
    command: 'cmd.exe',
    args: ['/d', '/s', '/c', `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /PID %a /F`],
  };
}

/**
 * 启动实例。
 * 返回 { ok, pid, kill } —— 进度与输出通过 onLog 回调给上层。
 */
function start(inst, onLog) {
  const built = buildStart(inst);
  if (!built.ok) return built;

  let child;
  try {
    child = spawn(built.command, built.args, {
      detached: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
      // cmd.exe 不认 Node 默认的 \" 转义；wsl.exe 走标准解析，认
      windowsVerbatimArguments: /cmd\.exe$/i.test(built.command),
    });
  } catch (err) {
    return { ok: false, error: `启动失败：${err.message}` };
  }

  const sink = (buf) => {
    const text = buf.toString('utf8');
    if (onLog) onLog(text);
  };
  child.stdout.on('data', sink);
  child.stderr.on('data', sink);
  child.on('error', (err) => onLog && onLog(`[error] ${err.message}\n`));

  return { ok: true, pid: child.pid, child };
}

/** 停掉实例进程（整棵进程树） */
function stop(inst) {
  const built = buildStop(inst);
  try {
    const child = spawn(built.command, built.args, {
      windowsHide: true,
      stdio: 'ignore',
      windowsVerbatimArguments: /cmd\.exe$/i.test(built.command),
    });
    child.unref();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  defaultInstances,
  resolveUrl,
  applyToken,
  pickUrlFrom,
  probe,
  portOpen,
  start,
  stop,
  runWsl,
  wslArgs,
  DEFAULT_URL_FILE,
  WSL_START_SCRIPT,
  WSL_HOME,
};
