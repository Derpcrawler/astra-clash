// Astra Clash: sign the app with the local self-signed identity "Astra Clash Local" when this Mac
// has it. A stable identity keeps the app's signature the same across builds, so macOS treats each
// build as the same app; ad-hoc signatures change with every build. The certificate carries no personal
// data. Without it, the ad-hoc signature from electron-builder stays.
const { execFileSync } = require('child_process')
const path = require('path')

const IDENTITY = 'Astra Clash Local'

exports.default = async function (context) {
  if (context.electronPlatformName !== 'darwin') return
  const ids = execFileSync('security', ['find-identity', '-p', 'codesigning'], { encoding: 'utf8' })
  if (!ids.includes(`"${IDENTITY}"`)) {
    console.log(`  • ${IDENTITY} not found, keeping the ad-hoc signature`)
    return
  }
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  const entitlements = path.join(__dirname, 'entitlements.mac.plist')
  execFileSync(
    'codesign',
    ['--force', '--deep', '--sign', IDENTITY, '--entitlements', entitlements, '--timestamp=none', app],
    { stdio: 'inherit' }
  )
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' })
  console.log(`  • signed with ${IDENTITY}`)
}
