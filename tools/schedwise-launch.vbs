Option Explicit

' Hidden launcher for SchedWise. Shortcut arguments:
'   start  -> start MySQL/PHP/Vite and open the app
'   stop   -> stop the PHP/Vite processes started by SchedWise

Dim shell, fso, here, ps1, action, command, exitCode
If WScript.Arguments.Count > 0 Then
    action = LCase(WScript.Arguments(0))
Else
    action = "start"
End If

If action <> "start" And action <> "stop" Then
    MsgBox "Unknown SchedWise action: " & action, 16, "SchedWise"
    WScript.Quit 1
End If

Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = fso.BuildPath(here, "schedwise-launcher.ps1")

command = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """ " & action
Set shell = CreateObject("WScript.Shell")
exitCode = shell.Run(command, 0, True)

If exitCode <> 0 Then
    MsgBox "SchedWise could not " & action & "." & vbCrLf & vbCrLf & _
           "Check the launcher log in:" & vbCrLf & _
           fso.BuildPath(fso.GetParentFolderName(here), ".runtime\logs"), 16, "SchedWise"
End If
