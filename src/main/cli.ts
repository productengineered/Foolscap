import { resolve } from 'node:path'

export interface ArgvFilter {
  /* app.getAppPath() — excludes the appDir argument of `electron <appDir>`. */
  appPath: string
  /* Directory probe, injected so tests stay hermetic. Nonexistent paths must
   * return false: `foolscap new-note.md` is a file to create, not noise. */
  isDirectory(path: string): boolean
}

/* Extract document paths from an Electron argv — first launch or the argv
 * relayed by second-instance. Position is meaningless: Chromium inserts its
 * own flags anywhere in a relayed argv (e.g. --enable-avfoundation between
 * the binary and the app dir), so everything after argv[0] is judged on what
 * it is: not a flag, not the app path, not a directory. */
export function pathsFromArgv(argv: string[], cwd: string, filter: ArgvFilter): string[] {
  return argv
    .slice(1)
    .filter((arg) => !arg.startsWith('-'))
    .map((arg) => resolve(cwd, arg))
    .filter((path) => path !== filter.appPath && !filter.isDirectory(path))
}
