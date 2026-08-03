import '@fontsource-variable/recursive/full.css'
import '@fontsource-variable/fraunces/full.css'
/* The writing-font roster (see FONTS in ui/modes.ts). */
import '@fontsource-variable/literata'
import '@fontsource-variable/literata/wght-italic.css'
import '@fontsource-variable/source-serif-4'
import '@fontsource-variable/source-serif-4/wght-italic.css'
import '@fontsource-variable/lora'
import '@fontsource-variable/lora/wght-italic.css'
import '@fontsource-variable/crimson-pro'
import '@fontsource-variable/crimson-pro/wght-italic.css'
import '@fontsource-variable/bitter'
import '@fontsource-variable/bitter/wght-italic.css'
import '@fontsource-variable/inter'
import '@fontsource-variable/inter/wght-italic.css'
import '@fontsource-variable/source-sans-3'
import '@fontsource-variable/source-sans-3/wght-italic.css'
import '@fontsource-variable/ibm-plex-sans'
import '@fontsource-variable/ibm-plex-sans/wght-italic.css'
import '@fontsource-variable/work-sans'
import '@fontsource-variable/work-sans/wght-italic.css'
import '@fontsource-variable/outfit'
import './styles/fonts-ioskeley.css'
import './styles/tokens.css'
import './styles/themes/ledger.css'
import './styles/themes/plate.css'
import './styles/themes/manuscript.css'
import './styles/themes/github.css'
import './styles/themes/github-dark.css'
import './styles/themes/vercel.css'
import './styles/themes/vscode.css'
import './styles/base.css'
import { openSearchPanel } from '@codemirror/search'
import { EditorView } from '@codemirror/view'
import { renderMarkdown } from '../shared/markdown'
import { createEditor } from './editor/setup'
import helpMd from './help.md?raw'
import { classifyDrop } from './ui/drop'
import {
  adjustTextSize,
  applyCustomTheme,
  applyFont,
  applyTextSize,
  applyTheme,
  FONTS,
  Modes,
  restoreFont,
  restoreTextSize,
  restoreTheme,
  THEMES
} from './ui/modes'
import { hideConflictBar, showConflictBar, showToast, showUpdateToast } from './ui/notice'
import { Outline } from './ui/outline'
import { Palette, type PaletteCommand } from './ui/palette'
import { Preview } from './ui/preview'
import { Settings } from './ui/settings'
import { TableControls } from './ui/table-controls'
import { initTitlebar, setTitlebar } from './ui/titlebar'

restoreTheme()
restoreFont()
restoreTextSize()
initTitlebar()

const app = document.getElementById('app')
if (!(app instanceof HTMLElement)) {
  throw new Error('renderer: #app mount point missing from index.html')
}

/* Dirty is a changed-since-load flag, not a diff: set on the first edit,
 * cleared when main confirms a save or pushes a fresh document. */
let dirty = false
let currentPath: string | null = null
let currentDir: string | null = null

const editor = createEditor(app, {
  onDocChanged: () => {
    if (!dirty) {
      dirty = true
      window.foolscap.setDirty(true)
      setTitlebar(currentPath, true)
    }
  },
  onUpdate: (update) => {
    outline.handleUpdate(update)
    modes.handleUpdate(update)
  },
  onNoDocumentForPaste: () => showToast('Save the document first — pasted images need a folder to live beside.')
})
const outline = new Outline(editor.view, (pos) => {
  const anchor = Math.min(pos, editor.view.state.doc.length)
  editor.view.dispatch({
    selection: { anchor },
    effects: EditorView.scrollIntoView(anchor, { y: 'start' })
  })
  // In preview, the visible pane must move too; otherwise focus the editor.
  if (preview.visible) preview.scrollTo(anchor)
  else editor.view.focus()
})
const modes = new Modes(editor.view)
new TableControls(editor.view)

/* ---- Preview mode ---- */

const preview = new Preview((pos) => exitPreview(pos))

/* The render is async, so "previewing" is three states, not two: hidden,
 * entering (render in flight), shown. The generation counter lets exit
 * cancel an in-flight enter — Preview.show unconditionally un-hides when it
 * resolves, and a stale resolution must not overrule the user's toggle. */
let previewGen = 0
let previewEntering = false

async function enterPreview(nearPos?: number): Promise<void> {
  const at = nearPos ?? editor.view.state.selection.main.head
  const gen = ++previewGen
  previewEntering = true
  try {
    // Render before hiding the editor: while the pipeline works, the user
    // sees their document as text — never blank paper.
    await preview.show(editor.getContent(), currentDir, at)
    if (gen !== previewGen) {
      preview.hide()
      return
    }
    document.documentElement.classList.add('previewing')
  } catch (err) {
    if (gen !== previewGen) return
    // Never strand the user staring at a hidden editor.
    console.error('preview render failed', err)
    exitPreview()
    showToast('Preview failed to render — staying in the editor.')
  } finally {
    if (gen === previewGen) previewEntering = false
  }
}

function exitPreview(pos?: number): void {
  previewGen++
  previewEntering = false
  document.documentElement.classList.remove('previewing')
  preview.hide()
  if (pos !== undefined) {
    const anchor = Math.min(pos, editor.view.state.doc.length)
    editor.view.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: 'center' })
    })
  }
  editor.view.focus()
}

function togglePreview(): void {
  if (preview.visible || previewEntering) exitPreview()
  else void enterPreview()
}

/* ---- Help: a markdown document rendered by the same preview machinery it
 * explains. Overlays whatever you're doing; leaves the buffer untouched.
 * Constructed after `preview` so it stacks above it. ---- */

const helpPreview = new Preview(() => helpPreview.hide())

function toggleHelp(): void {
  if (helpPreview.visible) {
    helpPreview.hide()
    editor.view.focus()
  } else {
    void helpPreview.show(helpMd, null, 0).catch(() => showToast('Help failed to render.'))
  }
}

function loadCustomTheme(): void {
  void window.foolscap.loadCustomTheme().then((css) => {
    if (css === null) return
    applyCustomTheme(css)
    showToast('Custom theme applied — define your palette under :root[data-theme=\'custom\'].')
  })
}

const settings = new Settings({ modes, loadCustomTheme })

window.foolscap.onCommand((command) => {
  if (command === 'toggle-outline') outline.toggle()
  else if (command === 'toggle-typewriter') modes.toggleTypewriter()
  else if (command === 'toggle-focus') modes.toggleFocus()
  else if (command === 'toggle-palette') palette.toggle()
  else if (command === 'toggle-preview') togglePreview()
  else if (command === 'show-help') toggleHelp()
  else if (command === 'text-larger') adjustTextSize(1)
  else if (command === 'text-smaller') adjustTextSize(-1)
  else if (command === 'text-reset') applyTextSize(null)
  else if (command === 'open-settings') settings.toggle()
})

const mod = window.foolscap.platform === 'darwin' ? '⌘' : 'Ctrl+'

const paletteCommands = (): PaletteCommand[] => [
  { id: 'new-window', title: 'New Window', hint: `${mod}N`, run: () => window.foolscap.exec('window-new') },
  { id: 'open', title: 'Open…', hint: `${mod}O`, run: () => window.foolscap.exec('file-open') },
  { id: 'save', title: 'Save', hint: `${mod}S`, run: () => window.foolscap.exec('file-save') },
  { id: 'save-as', title: 'Save As…', run: () => window.foolscap.exec('file-save-as') },
  {
    id: 'find',
    title: 'Find & Replace',
    hint: `${mod}F`,
    run: () => {
      if (preview.visible || previewEntering) exitPreview()
      openSearchPanel(editor.view)
    }
  },
  { id: 'preview', title: 'Toggle Preview', hint: `${mod}E`, run: () => togglePreview() },
  { id: 'help', title: 'wtf is this? (Help)', hint: `⇧${mod}/`, run: () => window.foolscap.exec('help-window') },
  { id: 'outline', title: 'Toggle Outline', hint: `⇧${mod}O`, run: () => outline.toggle() },
  { id: 'export-html', title: 'Export as HTML…', run: () => window.foolscap.exec('export-html') },
  { id: 'export-pdf', title: 'Export as PDF…', run: () => window.foolscap.exec('export-pdf') },
  { id: 'typewriter', title: 'Toggle Typewriter Mode', run: () => modes.toggleTypewriter() },
  { id: 'focus', title: 'Toggle Focus Mode', run: () => modes.toggleFocus() },
  { id: 'wordcount', title: 'Toggle Word Count', run: () => modes.toggleWordCount() },
  { id: 'settings', title: 'Settings…', hint: `${mod},`, run: () => settings.toggle() },
  { id: 'print', title: 'Print…', hint: `${mod}P`, run: () => window.foolscap.exec('file-print') },
  { id: 'text-larger', title: 'Text Size: Larger', hint: `${mod}+`, run: () => void adjustTextSize(1) },
  { id: 'text-smaller', title: 'Text Size: Smaller', hint: `${mod}−`, run: () => void adjustTextSize(-1) },
  { id: 'text-reset', title: 'Text Size: Reset', hint: `${mod}0`, run: () => void applyTextSize(null) },
  { id: 'theme-custom', title: 'Theme: Load Custom…', run: () => loadCustomTheme() },
  { id: 'font-default', title: 'Font: Recursive (Default)', run: () => applyFont(null) },
  ...FONTS.map((font) => ({
    id: `font-${font.id}`,
    title: `Font: ${font.label}`,
    hint: font.kind,
    run: () => applyFont(font.id)
  })),
  { id: 'theme-auto', title: 'Theme: Auto (System)', run: () => applyTheme(null) },
  ...THEMES.map((theme) => ({
    id: `theme-${theme.id}`,
    title: `Theme: ${theme.label}`,
    run: () => applyTheme(theme.id)
  }))
]

const palette = new Palette(paletteCommands, () => editor.view.focus())

/* Drag a markdown file onto the window to open it here — with the same
 * unsaved-changes guard as any other open. Capture phase: CodeMirror's drop
 * handler preventDefaults but never stops propagation, so without this it
 * inserts the file's text and we open it too. */
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener(
  'drop',
  (e) => {
    const files = e.dataTransfer?.files
    const verdict = classifyDrop(files ? Array.from(files, (f) => f.name) : [])
    if (verdict === 'pass') return
    e.preventDefault()
    e.stopPropagation()
    if (verdict === 'reject') {
      showToast('Foolscap opens markdown files (.md, .markdown, .mdx, .txt).')
      return
    }
    const file = files?.[0]
    if (!file) return
    const path = window.foolscap.pathForFile(file)
    if (path) window.foolscap.openDropped(path)
  },
  true
)

/* First-ever run: open with the manual. Once, ever. */
if (!localStorage.getItem('foolscap:first-run-done')) {
  localStorage.setItem('foolscap:first-run-done', '1')
  toggleHelp()
}

window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    palette.toggle()
  } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o') {
    // Redundant with the menu accelerator — whichever fires first wins,
    // the other never sees the event.
    e.preventDefault()
    outline.toggle()
  } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 't') {
    // Old tab reflex — native tabs are gone (they fought the frameless
    // titlebar); a fresh window is what the finger meant.
    e.preventDefault()
    window.foolscap.exec('window-new')
  } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'e') {
    e.preventDefault()
    if (helpPreview.visible) toggleHelp()
    else togglePreview()
  } else if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === ',') {
    e.preventDefault()
    settings.toggle()
  } else if ((e.metaKey || e.ctrlKey) && (e.key === '=' || e.key === '+')) {
    e.preventDefault()
    adjustTextSize(1)
  } else if ((e.metaKey || e.ctrlKey) && e.key === '-') {
    e.preventDefault()
    adjustTextSize(-1)
  } else if (e.key === 'Escape' && settings.visible) {
    e.preventDefault()
    settings.close()
  } else if (e.key === 'Escape' && helpPreview.visible) {
    e.preventDefault()
    toggleHelp()
  } else if (e.key === 'Escape' && (preview.visible || previewEntering)) {
    e.preventDefault()
    exitPreview()
  }
})

const markClean = (): void => {
  dirty = false
  window.foolscap.setDirty(false)
  setTitlebar(currentPath, false)
}

window.foolscap.onLoad((doc) => {
  hideConflictBar()
  currentPath = doc.path
  currentDir = doc.dir
  editor.replace(doc.content, doc.dir)
  if (doc.dirty) {
    // Restored unsaved buffer — arrives already-dirty.
    dirty = true
    window.foolscap.setDirty(true)
    setTitlebar(currentPath, true)
  } else {
    markClean()
  }
  outline.refresh()
  modes.refresh()
  // Existing clean documents open in preview; new, empty, or restored-dirty
  // ones go straight to the editor. Double-click (or ⌘E / Escape) edits.
  if (!doc.dirty && doc.path && doc.content.trim() !== '') {
    void enterPreview(0)
  } else {
    exitPreview()
  }
})

window.foolscap.onSaved((saved) => {
  currentPath = saved.path
  currentDir = saved.dir
  editor.setDocDir(saved.dir)
  markClean()
})

window.foolscap.onRequestContent(() => {
  window.foolscap.sendContent(editor.getContent())
})

window.foolscap.onConflict(() => {
  showConflictBar((choice) => {
    window.foolscap.resolveConflict(choice)
    editor.view.focus()
  })
})

window.foolscap.onUpdateAvailable(({ version, url }) => showUpdateToast(version, url))

editor.view.focus()

// Warm the markdown pipeline (processor + highlighter creation) now, so the
// first preview or help render pays only for rendering. Concurrent callers
// share the cached promise, so an immediate open-to-preview never races it.
void renderMarkdown('')
