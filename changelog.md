## 1.0.1

- Downloading a newer core in Settings installs exactly the file that was checked. A file changed during the password prompt is refused, and the current core stays.
- Downloading a core also works while disconnected.
- Stopping, restarting or quitting no longer hangs when the core does not stop or does not report that it started.
- A damaged settings file is recovered from its backup instead of resetting all settings. Settings files are readable only by your user account.
- After the computer wakes from sleep, the app no longer turns the system proxy back on if you disconnected in the meantime.
- TUN mode stays on across restarts when "Take over TUN settings" is off.

## 1.0.0

First release, for macOS (Apple Silicon) and Windows (x64).
