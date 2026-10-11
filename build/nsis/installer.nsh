; Noctur: upstream's script uninstalled an existing Koala Clash and copied its profiles into Koala
; Clash's data folder. Noctur installs next to Koala Clash and leaves it alone.

!ifndef BUILD_UNINSTALLER
; The app was called Astra Clash before (app id app.astraclash), which Windows lists as a different
; program. Its uninstall entry is electron-builder's key for that app id.
!define ASTRA_UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\3915a198-d9a5-5f50-b17f-4c02aa5ea7b1"
!define ASTRA_INSTALL_KEY "Software\3915a198-d9a5-5f50-b17f-4c02aa5ea7b1"
Var astraAutostart

!macro customInit
  ; Whether Astra Clash started at logon: Noctur turns its own autostart on in that case
  ; (src/main/noctur/astra-carry.ts), from the marker written in customInstall.
  StrCpy $astraAutostart "0"
  nsExec::Exec '"$SYSDIR\schtasks.exe" /query /tn "astra-clash"'
  Pop $0
  ${if} $0 == "0"
    StrCpy $astraAutostart "1"
  ${endIf}

  ; Uninstall Astra Clash silently. Its data folder stays; Noctur moves it on first start
  ; (src/main/noctur/migrate-astra.ts). The uninstaller closes the app if it is running.
  ; If it cannot start or reports a failure, nothing of Astra Clash is removed by hand (its
  ; uninstaller, tasks and firewall rules stay, so it can still be uninstalled or repaired), and the
  ; user can try again or cancel the installation. A silent install cancels.
  ReadRegStr $1 HKLM "${ASTRA_UNINSTALL_KEY}" "UninstallString"
  ReadRegStr $2 HKLM "${ASTRA_INSTALL_KEY}" "InstallLocation"
  ${if} $1 != ""
  ${andIf} $2 != ""
    StrCpy $4 0
    astra_uninstall:
      IntOp $4 $4 + 1
      ClearErrors
      ExecWait '$1 /S /KEEP_APP_DATA _?=$2' $3
      ${if} ${Errors}
      ${orIf} $3 != "0"
        ; Its uninstaller closes the app first, and the app and its core can still hold files for a
        ; moment after that. Try again quietly, as electron-builder does when it updates its own
        ; apps (up to five attempts, a second apart), before asking.
        ${if} $4 < 5
          Sleep 1000
          Goto astra_uninstall
        ${endIf}
        MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "Astra Clash, the previous version of Noctur, could not be uninstalled. Close Astra Clash and try again, or cancel and uninstall it from Settings, Apps." /SD IDCANCEL IDRETRY astra_uninstall
        Quit
      ${endIf}
    ; Run in place (_?=), the uninstaller cannot delete itself. Only that file and the then empty
    ; folder are removed: the folder could be one the user chose and share with other files.
    Delete "$2\Uninstall Astra Clash.exe"
    RMDir "$2"
  ${endIf}

  ; Its scheduled tasks and firewall rules, in case the uninstall did not remove them. Its rules
  ; carry the app's internal name "astra-clash"; older uninstallers looked for "Astra Clash".
  nsExec::Exec '"$SYSDIR\schtasks.exe" /delete /tn "astra-clash-run" /f'
  nsExec::Exec '"$SYSDIR\schtasks.exe" /delete /tn "astra-clash" /f'
  nsExec::Exec 'powershell -NoProfile -Command "Remove-NetFirewallRule -DisplayName \"astra-clash\",\"astra-clash mihomo\",\"astra-clash mihomo-alpha\",\"Astra Clash\",\"Astra Clash mihomo\",\"Astra Clash mihomo-alpha\" -ErrorAction SilentlyContinue"'
!macroend

!macro customInstall
  ${if} $astraAutostart == "1"
    FileOpen $0 "$INSTDIR\astra-clash-autostart" w
    FileClose $0
  ${endIf}
!macroend
!endif

!macro customUnInstall
  ; On a real uninstall (not an update), remove the scheduled tasks the app creates: the one that
  ; starts it as administrator (src/main/sys/misc.ts) and the autostart task (src/main/sys/autoRun.ts).
  ${ifNot} ${isUpdated}
    nsExec::Exec '"$SYSDIR\schtasks.exe" /delete /tn "noctur-run" /f'
    nsExec::Exec '"$SYSDIR\schtasks.exe" /delete /tn "noctur" /f'
    ; Firewall rules from Settings, Advanced (src/main/sys/misc.ts, setupFirewall). Their names start
    ; with app.getName(), the package name "noctur".
    nsExec::Exec 'powershell -NoProfile -Command "Remove-NetFirewallRule -DisplayName \"noctur\",\"noctur mihomo\",\"noctur mihomo-alpha\" -ErrorAction SilentlyContinue"'
    Delete "$INSTDIR\astra-clash-autostart"
  ${endIf}
!macroend
