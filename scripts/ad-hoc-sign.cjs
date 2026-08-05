/* afterPack hook: ad-hoc sign the mac bundle when it has no valid seal.
 *
 * electron-builder repacks Electron.app (asar, Info.plist, rename), which
 * breaks the seal on Electron's stock ad-hoc signature. Intel macOS shrugs;
 * Apple Silicon refuses to run quarantined apps with a broken seal and
 * reports them as "damaged" — right-click → Open can't override that. A
 * fresh ad-hoc signature (`codesign -s -`) restores a valid seal, which
 * downgrades the failure to the ordinary unidentified-developer flow.
 *
 * The guard is the seal itself, not the env: when electron-builder signed
 * with a real identity (CSC_LINK in CI, or a Developer ID found in the
 * local keychain), verification passes and this hook must not touch the
 * bundle — re-signing ad-hoc would destroy the real signature. */
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = function adHocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )
  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], {
      stdio: 'ignore'
    })
    return // valid seal — real or ad-hoc, leave it alone
  } catch {
    // broken or missing seal — fall through and ad-hoc sign
  }
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], {
    stdio: 'inherit'
  })
}
