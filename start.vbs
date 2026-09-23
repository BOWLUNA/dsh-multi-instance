' ============================================================
'  DSH 套壳 —— 无窗口启动器（不闪黑框）
'
'  与 start.cmd 等价，区别只是不出现 cmd 窗口。
'  同样必须移除 ELECTRON_RUN_AS_NODE，否则应用起不来。
' ============================================================
Option Explicit

Dim sh, fso, base, exePath
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

base = fso.GetParentFolderName(WScript.ScriptFullName)
exePath = base & "\node_modules\electron\dist\electron.exe"

If Not fso.FileExists(exePath) Then
  MsgBox "找不到 electron。" & vbCrLf & vbCrLf & _
         "请先在本目录执行： npm install", 16, "DSH 套壳"
  WScript.Quit 1
End If

' 移除会让 electron 退化成 node 的环境变量
On Error Resume Next
sh.Environment("PROCESS").Remove("ELECTRON_RUN_AS_NODE")
On Error GoTo 0

sh.CurrentDirectory = base
sh.Run """" & exePath & """ """ & base & """", 0, False
WScript.Quit 0
