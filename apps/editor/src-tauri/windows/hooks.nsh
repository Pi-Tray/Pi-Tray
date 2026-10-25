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
  ; the uninstall an update runs first turns start at login off, and leaves this behind if it was on
  ${If} ${FileExists} "$APPDATA\pi-tray\autostart-on-reinstall"
    nsExec::Exec '"$INSTDIR\pi-tray.exe" autostart enable'
    Pop $0
    Delete "$APPDATA\pi-tray\autostart-on-reinstall"
  ${EndIf}

  ; starts the supervisor again (or for the first time), which moves itself into the background and starts the server
  Exec '"$INSTDIR\pi-tray.exe" supervise'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  ; updating runs this uninstall before installing the new version, so remember start at login was on for POSTINSTALL.
  ; a real uninstall leaves the note in the data folder with the rest of the settings, so a reinstall turns it back on
  ReadRegStr $0 HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Pi-Tray"
  ${If} $0 != ""
    CreateDirectory "$APPDATA\pi-tray"
    FileOpen $1 "$APPDATA\pi-tray\autostart-on-reinstall" w
    FileClose $1
  ${EndIf}

  ; done while pi-tray.exe still exists, so the Run key doesn't keep pointing at a missing file after it's removed
  IfFileExists "$INSTDIR\pi-tray.exe" 0 +3
    nsExec::Exec '"$INSTDIR\pi-tray.exe" autostart disable'
    Pop $0

  !insertmacro PI_TRAY_STOP
!macroend
