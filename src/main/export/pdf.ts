import { BrowserWindow } from 'electron'
import { readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { renderExportHtml } from './html'

const nodeRequire = createRequire(__filename)

interface EmbeddedFace {
  family: string
  /* Relative path under Resources/fonts (packaged) — the fallbacks resolve
   * per source kind below. */
  file: string
  source: { kind: 'fontsource'; pkg: string } | { kind: 'repo' }
  weight: string
  style: 'normal' | 'italic'
  format: string
  mime: string
}

const FACES: EmbeddedFace[] = [
  {
    family: 'Recursive Variable',
    file: 'recursive-latin-full-normal.woff2',
    source: { kind: 'fontsource', pkg: '@fontsource-variable/recursive' },
    weight: '100 1000',
    style: 'normal',
    format: 'woff2-variations',
    mime: 'font/woff2'
  },
  {
    family: 'Fraunces Variable',
    file: 'fraunces-latin-full-normal.woff2',
    source: { kind: 'fontsource', pkg: '@fontsource-variable/fraunces' },
    weight: '100 1000',
    style: 'normal',
    format: 'woff2-variations',
    mime: 'font/woff2'
  },
  {
    family: 'Ioskeley Mono',
    file: 'ioskeley/IoskeleyMono-Regular.woff2',
    source: { kind: 'repo' },
    weight: '400',
    style: 'normal',
    format: 'woff2',
    mime: 'font/woff2'
  },
  {
    family: 'Ioskeley Mono',
    file: 'ioskeley/IoskeleyMono-Italic.woff2',
    source: { kind: 'repo' },
    weight: '400',
    style: 'italic',
    format: 'woff2',
    mime: 'font/woff2'
  },
  {
    family: 'Ioskeley Mono',
    file: 'ioskeley/IoskeleyMono-Bold.woff2',
    source: { kind: 'repo' },
    weight: '700',
    style: 'normal',
    format: 'woff2',
    mime: 'font/woff2'
  }
]

/* Embed the real fonts so the PDF is typeset exactly like the editor —
 * Recursive body (when themed so), Fraunces headings, Ioskeley Mono code.
 * Packaged builds read Resources/fonts (extraResources); dev resolves
 * node_modules and the repo fonts/ dir. Missing faces degrade to system
 * fallbacks, never break the export. */
async function buildFontFaceCss(): Promise<string[]> {
  const { app } = await import('electron')
  const css: string[] = []
  for (const face of FACES) {
    const candidates: string[] = []
    if (process.resourcesPath) {
      candidates.push(join(process.resourcesPath, 'fonts', face.file))
    }
    if (face.source.kind === 'fontsource') {
      try {
        candidates.push(
          nodeRequire
            .resolve(`${face.source.pkg}/package.json`)
            .replace(/package\.json$/, `files/${face.file}`)
        )
      } catch {
        // node_modules not present (packaged) — resources path covers it
      }
    } else {
      candidates.push(join(app.getAppPath(), 'fonts', face.file))
    }
    for (const path of candidates) {
      try {
        const data = await readFile(path)
        css.push(
          `@font-face { font-family: '${face.family}'; ` +
            `src: url(data:${face.mime};base64,${data.toString('base64')}) format('${face.format}'); ` +
            `font-weight: ${face.weight}; font-style: ${face.style}; font-display: block; }`
        )
        break
      } catch {
        // try the next candidate
      }
    }
  }
  return css
}

let fontCssPromise: Promise<string> | null = null

/* The faces never change at runtime, so read and encode them once. Neither a
 * rejection nor an incomplete set is cached: a transient failure must not
 * poison every later print, though the degraded result still serves this one. */
function fontFaceCss(): Promise<string> {
  fontCssPromise ??= buildFontFaceCss().then(
    (faces) => {
      if (faces.length < FACES.length) fontCssPromise = null
      return faces.join('\n')
    },
    (err: unknown) => {
      fontCssPromise = null
      throw err
    }
  )
  return fontCssPromise
}

/* Hidden window holding the fully-typeset export rendering — the shared
 * engine behind both PDF export and Print. Caller must destroy. */
async function openExportWindow(
  markdown: string,
  title: string,
  docDir: string | null
): Promise<{ win: BrowserWindow; cleanup: () => Promise<void> }> {
  const html = await renderExportHtml(markdown, { title, extraCss: await fontFaceCss() })
  // Relative image paths resolve against the document's directory.
  const withBase = docDir
    ? html.replace('<head>', `<head>\n<base href="${pathToFileURL(docDir).toString()}/">`)
    : html

  const tmp = join(tmpdir(), `foolscap-print-${process.pid}-${Date.now()}.html`)
  await writeFile(tmp, withBase, 'utf8')

  const win = new BrowserWindow({
    show: false,
    webPreferences: { sandbox: true }
  })
  await win.loadURL(pathToFileURL(tmp).toString())
  // Fonts are data URIs but still load asynchronously; wait for them.
  await win.webContents.executeJavaScript('document.fonts.ready.then(() => true)', true)
  return {
    win,
    cleanup: async () => {
      win.destroy()
      await rm(tmp, { force: true })
    }
  }
}

/* Render markdown to a PDF buffer via a hidden window and printToPDF —
 * the whole reason the shell is Electron (ULTRAPLAN §3). */
export async function renderPdf(
  markdown: string,
  title: string,
  docDir: string | null
): Promise<Buffer> {
  const { win, cleanup } = await openExportWindow(markdown, title, docDir)
  try {
    return await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: false,
      pageSize: 'Letter'
    })
  } finally {
    await cleanup()
  }
}

/* ⌘P: the same rendering, handed to the system print dialog. */
export async function printDocument(
  markdown: string,
  title: string,
  docDir: string | null
): Promise<void> {
  const { win, cleanup } = await openExportWindow(markdown, title, docDir)
  await new Promise<void>((resolve) => {
    win.webContents.print({ printBackground: true }, () => resolve())
  })
  await cleanup()
}
