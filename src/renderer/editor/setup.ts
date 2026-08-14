import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { search, searchKeymap } from '@codemirror/search'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  drawSelection,
  dropCursor,
  keymap,
  type ViewUpdate
} from '@codemirror/view'
import { createFindPanel } from '../ui/find'
import { docDirFacet, livePreview } from './live-preview/index'
import { pasteImage } from './paste-image'
import { tableKeymap, tableNormalizer } from './table-commands'
import { foolscapTheme } from './theme'

export interface EditorHandle {
  view: EditorView
  getContent(): string
  /* Replace the whole document (open, new, external reload). Builds a fresh
   * state so undo history cannot cross file boundaries. Keeps the cursor
   * offset, clamped, so a silent external reload doesn't teleport the caret. */
  replace(content: string, docDir: string | null): void
  /* A standalone state for a background tab — same extensions, own undo
   * history. Swapped in with view.setState when its tab activates. */
  makeState(content: string, anchor: number, docDir: string | null): EditorState
  /* Save As moves the document without reloading it; relative image paths
   * must re-anchor without destroying undo history. */
  setDocDir(docDir: string | null): void
}

export interface EditorHooks {
  onDocChanged(): void
  onUpdate(update: ViewUpdate): void
  onNoDocumentForPaste(): void
  onPasteFailed(): void
}

/* What a new document opens as: a heading ready to be titled, cursor after
 * the mark, one paragraph below. Deliberately the pristine state, not an
 * edit — an untouched new window stays clean (no save prompt) and reusable
 * for opening files into. */
const NEW_DOC_TEMPLATE = '# \n\n'
const NEW_DOC_CURSOR = 2

export function createEditor(parent: HTMLElement, hooks: EditorHooks): EditorHandle {
  const docDir = new Compartment()
  const makeState = (doc: string, anchor = 0, dir: string | null = null): EditorState =>
    EditorState.create({
      doc,
      selection: { anchor: Math.min(anchor, doc.length) },
      extensions: [
        docDir.of(docDirFacet.of(dir)),
        history(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        search({ top: true, createPanel: createFindPanel }),
        /* Tables own Tab first; indentWithTab catches the rest — without it
         * Tab falls through to the browser's focus-move and the caret leaves
         * the document. */
        keymap.of([...tableKeymap, indentWithTab, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) hooks.onDocChanged()
          hooks.onUpdate(update)
        }),
        livePreview(),
        tableNormalizer(),
        pasteImage(hooks.onNoDocumentForPaste, hooks.onPasteFailed),
        foolscapTheme()
      ]
    })

  const view = new EditorView({ state: makeState(NEW_DOC_TEMPLATE, NEW_DOC_CURSOR), parent })

  return {
    view,
    getContent: () => view.state.doc.toString(),
    replace: (content, dir) => {
      const anchor = view.state.selection.main.head
      view.setState(makeState(content, anchor, dir))
    },
    makeState: (content, anchor, dir) => makeState(content, anchor, dir),
    setDocDir: (dir) => {
      view.dispatch({ effects: docDir.reconfigure(docDirFacet.of(dir)) })
    }
  }
}
