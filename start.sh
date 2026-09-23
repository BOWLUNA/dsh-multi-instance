#!/usr/bin/env bash
# DSH 套壳 —— 开发/命令行启动
#
# 必须 unset ELECTRON_RUN_AS_NODE，否则 electron 会以纯 Node 运行。
# 用法：
#   ./start.sh              正常启动
#   ./start.sh --demo       演示模式（展开两侧抽屉，给新用户看布局）
#   ./start.sh --verbose    把主进程日志同时打到终端
set -euo pipefail
cd "$(dirname "$0")"
unset ELECTRON_RUN_AS_NODE

EXE=./node_modules/electron/dist/electron.exe
if [ ! -f "$EXE" ]; then
  echo "[x] 找不到 electron，请先执行： npm install" >&2
  exit 1
fi

exec "$EXE" . --verbose "$@"
