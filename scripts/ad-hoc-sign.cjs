/* afterPack hook: ad-hoc sign the mac bundle when no real identity exists.
 *
 * electron-builder repacks Electron.app (asar, Info.plist, rename), which
 * breaks the seal on Electron's stock ad-hoc signature. Intel macOS shrugs;
 * Apple Silicon refuses to run quarantined apps with a broken seal and
 * reports them as "damaged" — right-click → Open can't override that. A
 * fresh ad-hoc signature (`codesign -s -`) restores a valid seal, which
 * downgrades the failure to the ordinary unidentified-developer flow.
 * Skipped when CSC_LINK is set: real signing supersedes this. */
const { execFileSync } = require('node:child_process')
const path = require('node:path')

exports.default = function adHocSign(context) {
  if (context.electronPlatformName !== 'darwin') return
  if (process.env.CSC_LINK) return
  const app = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  )
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', app], {
    stdio: 'inherit'
  })
}
