# 安全策略

## 这个项目会碰到什么

一个桌面套壳，装在本机、连的是你自己的 DSH。它经手的东西里有两类是敏感的：

| 东西 | 落在哪 | 说明 |
| --- | --- | --- |
| DSH 的访问 token | `%APPDATA%\dsh-multi-instance\config.json` 与地址栏 | 形如 `http://127.0.0.1:3080/?token=<64 位>`。`lastUrl` 字段会把它持久化下来 |
| 每个窗格的登录态 | `%APPDATA%\dsh-multi-instance\Partitions\` | 独立的浏览器 partition，里面有 cookie 与 localStorage |

**这两处都不在仓库里，也不该被贴到 issue 里。** 报问题时请把 token 换成 `***`。

应用**不会**读写 `~/.dsh` 下的任何凭证文件，也**不会**写入 dsh 启动器写出的地址文件（只读）。

## 支持范围

最新一个次版本（当前为 `0.3.x`）接受安全修复。更早的版本请先升级再说。

## 怎么报

**不要开公开 issue。** 走 GitHub 的私密通道：

<https://github.com/BOWLUNA/dsh-multi-instance/security/advisories/new>

请带上：版本、复现步骤、以及**你以为的攻击面**（比如「一个恶意网页能不能通过窗格读到另一个窗格的 cookie」）。

## 已知的设计取舍（不算漏洞，但你可能想知道）

- **没有进程沙箱**。窗格是 Electron `<webview>`，`nodeIntegration` 关闭、有白名单 preload 桥，
  但 DSH 页面本身跑在同一个 Chromium 里。如果你接一个**恶意的 DSH 服务端**，它就在你的机器上跑页面。
  所以：**只接你自己的实例。**
- **token 会落盘**。这是「重启应用不用重新认证」的代价。配置文件目录请勿分享或提交。
- **应用不校验远端证书**。HTTPS 站点的证书问题会以「连不上」的形式呈现（红色状态点），
  排障方法见 README —— 壳不会替你绕过它。
