// Astra Clash: switches for Koala Clash features that Astra Clash turns off. The upstream code stays
// in place behind them.
export const FORK = {
  // Self-update downloads and installs upstream Koala Clash builds; Astra Clash is updated by installing a new version.
  selfUpdate: false,
  // Asking mihomo to replace its own binary inside the app bundle. Settings, Core
  // downloads a newer core instead (astra/core-panel.tsx).
  coreUpgrade: false,
  // The system's own window buttons (macOS traffic lights, Windows caption buttons) instead of the
  // HTML look-alikes upstream draws.
  nativeWindowButtons: true,
  // "Quit Keep Core": quit the app but leave mihomo running, with no menu bar icon showing that a
  // connection may still be on.
  keepCore: false,
  // "Direct mode on these Wi-Fi networks": macOS hides the network name from apps, so it cannot work.
  wifiDirect: false
}
