/* Plain X.Y.Z comparison for the update notifier. Deliberately not a full
 * semver implementation: Foolscap versions are always three bare numbers
 * (see CLAUDE.md versioning discipline), so anything shaped differently is
 * treated as not-newer — a malformed feed must never produce a toast. */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return (a[i] ?? 0) > (b[i] ?? 0)
  }
  return false
}

function parseVersion(version: string): [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}
