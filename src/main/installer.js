'use strict';

/**
 * DSH 手动安装器
 *
 * 本应用**不捆绑** DSH，也不会在后台自动下载它。
 * 只有用户显式点击「开始安装」时，才会往目标位置执行一次 npm 安装。
 *
 * 目标可以是：
 *   windows → 装到 Windows 上的某个目录（需要本机有 node/npm）
 *   wsl     → 装到已有 WSL2 发行版的某个目录（需要该发行版里有 node/npm）
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const DEFAULT_REGISTRY = 'https://registry.npmjs.org/';
const PKG = '@deepseek-ai/dsh';

/** npm 11 起原生模块编译需要显式放行 */
const ALLOW_SCRIPTS =
  '--allow-scripts=@deepseek-ai/dsh-subprocess-local,koffi,node-pty,@google/genai,protobufjs,node-addon-require-builtin';

/** 组装 wsl.exe 参数。user 留空就用该发行版的默认用户 —— 不能写死，
 *  否则换台机器（用户名不同）就全废了。 */
function wslArgs(distro, user, script) {
  const args = ['-d', distro || 'Ubuntu'];
  if (user && String(user).trim()) args.push('-u', String(user).trim());
  args.push('--exec', 'bash', '-lc', script);
  return args;
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
        // cmd.exe 不认 Node 默认那套 \" 转义。命令里只要带引号（我们必然带，
        // 路径和 registry 都要引起来），就会被拆错并报
        // "The filename, directory name, or volume label syntax is incorrect."
        windowsVerbatimArguments: /cmd\.exe$/i.test(command),
      });
    } catch (e) {
      return finish({ ok: false, error: e.message });
    }
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch { /* ignore */ }
      finish({ ok: false, error: '超时', stdout: out, stderr: err });
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

/** 检查目标环境有没有 node / npm */
async function checkEnv({ target, distro, user }) {
  const script = 'command -v node >/dev/null 2>&1 && node -v; command -v npm >/dev/null 2>&1 && npm -v; echo "PATH_OK"';

  const r =
    target === 'wsl'
      ? await runCapture('wsl.exe', wslArgs(distro, user, script))
      : await runCapture('cmd.exe', ['/d', '/s', '/c', 'node -v & npm -v']);

  const text = (r.stdout || '') + (r.stderr || '');
  const node = (text.match(/v(\d+\.\d+\.\d+)/) || [])[0] || '';
  const npmMatches = text.match(/(\d+\.\d+\.\d+)/g) || [];
  const npm = npmMatches.length > 1 ? npmMatches[npmMatches.length - 1] : npmMatches[0] || '';

  if (!node || !npm) {
    return {
      ok: false,
      node,
      npm,
      error:
        target === 'wsl'
          ? '这个 WSL2 发行版里没有找到 node/npm，请先在 WSL 里装 Node.js'
          : '本机没有找到 node/npm，请先安装 Node.js',
      raw: text.trim().slice(0, 400),
    };
  }
  return { ok: true, node, npm, raw: text.trim().slice(0, 400) };
}

/** 安装产物里 dsh 可执行文件的位置 */
function binPath(target, dir) {
  if (target === 'wsl') return `${dir.replace(/\/+$/, '')}/bin/dsh`;
  return path.win32.join(dir, 'dsh.cmd');
}

/** 版本 → npm 包描述；空或 latest 就是默认通道 */
function specFor(version) {
  const v = String(version || '').trim();
  if (!v || v === 'latest') return PKG;
  return `${PKG}@${v}`;
}

/** 查 registry 上这个包的发行通道与版本列表 */
async function listVersions({ target, distro, user, registry, timeout = 40000 } = {}) {
  const reg = registry || DEFAULT_REGISTRY;

  let r;
  if (target === 'wsl') {
    const script = [
      'echo @@TAGS',
      `npm view ${PKG} dist-tags --json --registry=${reg} 2>/dev/null`,
      'echo @@VERS',
      `npm view ${PKG} versions --json --registry=${reg} 2>/dev/null`,
      'echo @@END',
    ].join('; ');
    r = await runCapture('wsl.exe', wslArgs(distro, user, script), timeout);
  } else {
    // cmd.exe 的分隔符是 & 、重定向是 2>nul —— 不能套 bash 的 `;` 和 `2>/dev/null`，
    // 否则整条命令语法错误、什么也拉不到（这个坑踩过一次）
    const script = [
      'echo @@TAGS',
      `npm view ${PKG} dist-tags --json --registry=${reg} 2>nul`,
      'echo @@VERS',
      `npm view ${PKG} versions --json --registry=${reg} 2>nul`,
      'echo @@END',
    ].join(' & ');
    r = await runCapture('cmd.exe', ['/d', '/s', '/c', script], timeout);
  }

  const text = (r.stdout || '') + (r.stderr || '');
  const between = (a, b) => {
    const i = text.indexOf(`@@${a}`);
    if (i < 0) return '';
    const j = text.indexOf(`@@${b}`, i);
    return text.slice(i + a.length + 2, j < 0 ? undefined : j);
  };

  let tags = {};
  let versions = [];
  try {
    tags = JSON.parse(between('TAGS', 'VERS').trim() || '{}');
  } catch { /* 拉不到就给空 */ }
  try {
    const raw = between('VERS', 'END').trim();
    const parsed = JSON.parse(raw || '[]');
    versions = Array.isArray(parsed) ? parsed : [parsed];
  } catch { /* 同上 */ }

  return {
    ok: versions.length > 0 || Object.keys(tags).length > 0,
    tags,
    versions: versions.reverse().slice(0, 60),
    error: versions.length ? '' : '拉不到版本列表（检查 npm 源或网络）',
  };
}

/**
 * 执行安装（长任务，输出通过 onLog 流式回传）
 * @returns {{ok:boolean, child?:ChildProcess, bin?:string, error?:string}}
 */
function install({ target, dir, registry, distro, user, allowScripts, version }, onLog) {
  if (!dir || !String(dir).trim()) {
    return { ok: false, error: '请先选择安装目录' };
  }
  const reg = registry || DEFAULT_REGISTRY;
  const allow = allowScripts === false ? '' : ALLOW_SCRIPTS;
  const cleanDir = String(dir).trim();
  const spec = specFor(version);

  let command;
  let args;

  if (target === 'wsl') {
    // 用 `~` 开头时在 bash 里必须换成 $HOME，否则引号内的 ~ 不展开、会建出叫 "~" 的目录
    const wslDir = cleanDir.startsWith('~/') ? `$HOME/${cleanDir.slice(2)}` : cleanDir;
    const script =
      `mkdir -p "${wslDir}" && cd "${wslDir}" && ` +
      `npm install -g ${spec} --prefix "${wslDir}" --registry "${reg}" ` +
      `--no-audit --no-fund ${allow}`.trim();
    command = 'wsl.exe';
    args = wslArgs(distro, user, script);
  } else {
    // cmd.exe 不认正斜杠：cd /d 和 mkdir 都会直接报
    // "The filename, directory name, or volume label syntax is incorrect."
    // 用文件选择器挑出来的路径是反斜杠，手填的往往是正斜杠 —— 必须统一。
    const winDir = cleanDir.replace(/\//g, '\\');
    // Windows 的 mkdir / md 不递归，父目录不存在就直接失败；在 Node 侧建好省事
    try {
      fs.mkdirSync(winDir, { recursive: true });
    } catch (err) {
      return { ok: false, error: `创建安装目录失败: ${err.message}` };
    }
    const cmd =
      `cd /d "${winDir}" && ` +
      `npm install -g ${spec} --prefix "${winDir}" --registry "${reg}" ` +
      `--no-audit --no-fund ${allow}`.trim();
    command = 'cmd.exe';
    args = ['/d', '/s', '/c', cmd];
  }

  let child;
  try {
    child = spawn(command, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '' },
      // cmd.exe 不认 Node 默认的 \" 转义 —— 命令带引号就会被拆错
      windowsVerbatimArguments: /cmd\.exe$/i.test(command),
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }

  const sink = (buf) => onLog && onLog(buf.toString('utf8'));
  child.stdout.on('data', sink);
  child.stderr.on('data', sink);
  child.on('error', (err) => onLog && onLog(`\n[error] ${err.message}\n`));

  return { ok: true, child, bin: binPath(target, cleanDir) };
}

/** 装完之后验证一下能不能跑起来 */
async function verify({ target, dir, distro, user }) {
  const bin = binPath(target, dir);
  const r =
    target === 'wsl'
      ? await runCapture('wsl.exe', wslArgs(distro, user, `"${bin}" --version 2>&1 || true`))
      : await runCapture('cmd.exe', ['/d', '/s', '/c', `"${bin}" --version 2>&1`], 20000);

  const text = ((r.stdout || '') + (r.stderr || '')).trim();
  const ok = /\d+\.\d+\.\d+/.test(text);
  return { ok, bin, output: text.slice(0, 300) };
}

module.exports = {
  checkEnv,
  install,
  verify,
  listVersions,
  specFor,
  binPath,
  DEFAULT_REGISTRY,
  PKG,
};
