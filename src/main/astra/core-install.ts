// Astra Clash: the privileged half of installing a downloaded core (astra/core-download.ts).
//
// The app downloads and checks the core as the user, so the file it hands over sits in a folder the
// user (and anything running as the user) can write. The administrator step therefore does not
// trust that file: it copies it once into a new staging folder inside the root-owned core folder,
// checks the SHA-256 of that copy against the digest the app computed from the verified download,
// and only then sets owner and mode and renames it over the target. A file swapped after the app's
// check fails the digest and is never installed; the previous core stays in place.

export interface InstallPlan {
  /** User-writable file holding the decompressed core. */
  source: string
  /** SHA-256 (hex) of the decompressed core, computed from the verified download in memory. */
  sha256: string
  /** Root-owned folder for downloaded cores. */
  coreDir: string
  /** File name inside coreDir, for example mihomo-v1.19.31. */
  name: string
  /** Owners to set; null leaves ownership alone (tests run without root). */
  dirOwner: string | null
  fileOwner: string | null
  /** Final file mode; 4755 gives the core the setuid bit it needs for TUN. */
  mode: string
}

/** Exit codes of the install script, for error messages. */
export const INSTALL_EXIT = {
  unsafePath: 3,
  digestMismatch: 4
} as const

function q(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`
}

export function installScript(p: InstallPlan): string {
  if (!/^[0-9a-f]{64}$/.test(p.sha256)) throw new Error('Bad SHA-256')
  if (!/^mihomo-v\d+\.\d+\.\d+$/.test(p.name)) throw new Error(`Bad core name: ${p.name}`)
  if (!/^[0-7]{3,4}$/.test(p.mode)) throw new Error(`Bad mode: ${p.mode}`)
  const dir = q(p.coreDir)
  const target = q(`${p.coreDir}/${p.name}`)
  const lines = [
    'set -eu',
    'umask 022',
    // The core folder and its parent must be real folders, not symlinks to somewhere else.
    `[ ! -L ${q(p.coreDir.replace(/\/[^/]+$/, ''))} ] || exit ${INSTALL_EXIT.unsafePath}`,
    `[ ! -L ${dir} ] || exit ${INSTALL_EXIT.unsafePath}`,
    `/bin/mkdir -p ${dir}`,
    ...(p.dirOwner ? [`/usr/sbin/chown ${q(p.dirOwner)} ${dir}`] : []),
    `/bin/chmod 755 ${dir}`,
    `[ ! -L ${target} ] || exit ${INSTALL_EXIT.unsafePath}`,
    // Fresh staging folder per attempt, inside the protected folder so the final rename stays on
    // one file system. Removed on every exit.
    `STAGE=$(/usr/bin/mktemp -d ${q(`${p.coreDir}/.staging.XXXXXX`)})`,
    `trap '/bin/rm -rf "$STAGE"' EXIT`,
    '/bin/chmod 700 "$STAGE"',
    // One read of the user file. Everything after this uses the protected copy.
    `/bin/cp ${q(p.source)} "$STAGE/core"`,
    `[ "$(/usr/bin/shasum -a 256 "$STAGE/core" | /usr/bin/cut -d' ' -f1)" = ${q(p.sha256)} ] || exit ${INSTALL_EXIT.digestMismatch}`,
    ...(p.fileOwner ? [`/usr/sbin/chown ${q(p.fileOwner)} "$STAGE/core"`] : []),
    `/bin/chmod ${p.mode} "$STAGE/core"`,
    `/bin/mv -f "$STAGE/core" ${target}`
  ]
  return lines.join('\n')
}

export function describeInstallFailure(code: number | undefined): string | null {
  if (code === INSTALL_EXIT.digestMismatch) {
    return 'The core file changed after it was checked; nothing was installed.'
  }
  if (code === INSTALL_EXIT.unsafePath) {
    return 'The core folder or file is a symbolic link; nothing was installed.'
  }
  return null
}

// Arguments for running a shell script through osascript; admin asks for the password.
export function osascriptArgs(shell: string, admin: boolean): string[] {
  const quoted = shell.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')
  return ['-e', `do shell script "${quoted}"${admin ? ' with administrator privileges' : ''}`]
}
