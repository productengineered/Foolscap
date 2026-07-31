import { app, net } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isNewerVersion } from '../shared/semver'

/* Update notifier, not updater: unsigned builds can't self-update on macOS
 * (Squirrel.Mac refuses apps without a code signature), so Foolscap tells
 * instead of installs. The feed is the repo's latest GitHub Release — the
 * tag IS the version, cut from package.json by the release step, so there
 * is no hand-maintained feed to forget. One toast per new version, ever;
 * every failure path is silent, because an update notice is the least
 * important thing this app does. */

const FEED_URL = 'https://api.github.com/repos/seamoss/Foolscap/releases/latest'

export interface UpdateInfo {
  version: string
  url: string
}

const noticeFile = (): string => join(app.getPath('userData'), 'update-notice.json')

async function alreadyNotified(version: string): Promise<boolean> {
  try {
    const raw = JSON.parse(await readFile(noticeFile(), 'utf8')) as { notified?: unknown }
    return raw.notified === version
  } catch {
    return false
  }
}

async function rememberNotified(version: string): Promise<void> {
  try {
    await writeFile(noticeFile(), JSON.stringify({ notified: version }))
  } catch {
    // best-effort; worst case the toast repeats next launch
  }
}

export function scheduleUpdateCheck(notify: (info: UpdateInfo) => void): void {
  /* FOOLSCAP_UPDATE_FEED points the check elsewhere and enables it in dev —
   * the only way to exercise the flow without cutting a release. */
  const override = process.env['FOOLSCAP_UPDATE_FEED']
  if (!app.isPackaged && !override) return
  // Well past startup: the check must never compete with first paint.
  setTimeout(() => void check(override ?? FEED_URL, notify), 5000)
}

async function check(url: string, notify: (info: UpdateInfo) => void): Promise<void> {
  try {
    const res = await net.fetch(url, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return
    const release = (await res.json()) as { tag_name?: unknown; html_url?: unknown }
    if (typeof release.tag_name !== 'string' || typeof release.html_url !== 'string') return
    const version = release.tag_name.replace(/^v/, '')
    if (!isNewerVersion(version, app.getVersion())) return
    if (await alreadyNotified(version)) return
    await rememberNotified(version)
    notify({ version, url: release.html_url })
  } catch {
    // offline, rate-limited, bad DNS — all fine, all silent
  }
}
