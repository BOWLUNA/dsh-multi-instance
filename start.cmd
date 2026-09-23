@echo off
rem ============================================================
rem  DSH 套壳 —— 启动器
rem
rem  关键：必须清掉 ELECTRON_RUN_AS_NODE。
rem  如果这个变量残留为 1（例如从 Electron 系工具的子进程里继承），
rem  electron.exe 会退化成纯 Node 解释器，Chromium 根本不会起来，
rem  现象是「双击后什么都没发生」。
rem ============================================================
setlocal
cd /d "%~dp0"
set "ELECTRON_RUN_AS_NODE="

if not exist "node_modules\electron\dist\electron.exe" (
  echo [x] 找不到 electron，请先在本目录执行： npm install
  pause
  exit /b 1
)

start "" "node_modules\electron\dist\electron.exe" "."
exit /b 0
