; Pi-Tray's NSIS installer hooks, see bundle > windows > nsis > installerHooks in tauri.conf.json.
; pi-tray.exe is the CLI sidecar, which runs the supervisor and the server in the background. Windows won't let a running
; executable be replaced or deleted, so it has to be stopped before files are copied or removed.

; asks pi-tray to quit, then waits for it to exit, killing it if it hasn't after a few seconds.
; only processes running from this install are touched, so a dev build elsewhere is left alone
!macro PI_TRAY_STOP
  IfFileExists "$INSTDIR\pi-tray.exe" 0 +3
    ; quit replies before the supervisor has finished stopping the server, so the wait below is still needed
    nsExec::Exec '"$INSTDIR\pi-tray.exe" quit'
    Pop $0

  nsExec::Exec `powershell.exe -NoProfile -NonInteractive -Command "$$processes = Get-Process pi-tray -ErrorAction SilentlyContinue | Where-Object { $$_.Path -eq '$INSTDIR\pi-tray.exe' }; if ($$processes) { $$processes | Wait-Process -Timeout 5 -ErrorAction SilentlyContinue; $$processes | Stop-Process -Force -ErrorAction SilentlyContinue }"`
  Pop $0
!macroend

!macro NSIS_HOOK_PREINSTALL
  ; an update, so the old pi-tray.exe can be replaced
  !insertmacro PI_TRAY_STOP
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; starts the supervisor again (or for the first time), which moves itself into the background and starts the server
  Exec '"$INSTDIR\pi-tray.exe" supervise'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; done while pi-tray.exe still exists, so the Run key doesn't keep pointing at a missing file after it's removed
  IfFileExists "$INSTDIR\pi-tray.exe" 0 +3
    nsExec::Exec '"$INSTDIR\pi-tray.exe" autostart disable'
    Pop $0

  !insertmacro PI_TRAY_STOP
!macroend
