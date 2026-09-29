; Astra Clash: upstream's script uninstalled an existing Koala Clash and copied its profiles into
; Koala Clash's data folder. Astra Clash installs next to Koala Clash and leaves it alone.

!macro customUnInstall
  ; On a real uninstall (not an update), remove the scheduled tasks the app creates: the one that
  ; starts it as administrator (src/main/sys/misc.ts) and the autostart task (src/main/sys/autoRun.ts).
  ${ifNot} ${isUpdated}
    nsExec::Exec '"$SYSDIR\schtasks.exe" /delete /tn "astra-clash-run" /f'
    nsExec::Exec '"$SYSDIR\schtasks.exe" /delete /tn "astra-clash" /f'
    ; Firewall rules from Settings, Advanced (src/main/sys/misc.ts, setupFirewall).
    nsExec::Exec 'powershell -NoProfile -Command "Remove-NetFirewallRule -DisplayName \"Astra Clash\",\"Astra Clash mihomo\",\"Astra Clash mihomo-alpha\" -ErrorAction SilentlyContinue"'
  ${endIf}
!macroend
