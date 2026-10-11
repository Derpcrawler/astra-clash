// Noctur: switches for Koala Clash features that Noctur turns off. The upstream code stays
// in place behind them.
export const FORK = {
  // The system's own window buttons (macOS traffic lights, Windows caption buttons) instead of the
  // HTML look-alikes upstream draws.
  nativeWindowButtons: true,
  // "Quit Keep Core": quit the app but leave mihomo running, with no menu bar icon showing that a
  // connection may still be on.
  keepCore: false,
  // "Direct mode on these Wi-Fi networks": macOS hides the network name from apps, so it cannot work.
  wifiDirect: false,
  // Encrypt two settings with Electron safeStorage (the macOS keychain). Off: they are stored as plain
  // text, so the app never prompts for keychain access.
  keychain: false
}
