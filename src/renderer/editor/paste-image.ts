import { EditorView } from '@codemirror/view'
import {
  EditorSelection,
  type EditorState,
  type Extension,
  type TransactionSpec
} from '@codemirror/state'

/* Paste an image from the clipboard: bytes go to main, which writes them
 * into an assets/ folder beside the document and answers with a relative
 * path; the editor gets a plain markdown image link with the cursor parked
 * in the alt text. Main answers null for an unsaved document — there is no
 * "beside" yet — and rejects when the write itself fails. Either way the
 * user has to hear about it: preventDefault has already suppressed the
 * ordinary paste, so a swallowed failure leaves nothing behind at all. */

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

export function extForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null
}

/* changeByRange maps positions across sibling ranges, so with multiple
 * cursors each one gets its own link with the caret in the alt brackets —
 * a fixed selection.main offset would land inside an earlier insertion. */
export function imageInsertion(state: EditorState, relPath: string): TransactionSpec {
  return state.changeByRange((range) => ({
    changes: { from: range.from, to: range.to, insert: `![](${relPath})` },
    range: EditorSelection.cursor(range.from + 2)
  }))
}

export function pasteImage(onNoDocument: () => void, onFailed: () => void): Extension {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      const items = event.clipboardData?.items
      if (!items) return false
      const image = Array.from(items).find((item) => extForMime(item.type) !== null)
      const file = image?.getAsFile()
      if (!image || !file) return false
      event.preventDefault()
      void insertPastedImage(view, file, extForMime(image.type) as string, onNoDocument).catch(
        onFailed
      )
      return true
    }
  })
}

export async function insertPastedImage(
  view: EditorView,
  file: File,
  ext: string,
  onNoDocument: () => void
): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const relPath = await window.foolscap.pasteImage(bytes, ext)
  if (!relPath) {
    onNoDocument()
    return
  }
  view.dispatch(imageInsertion(view.state, relPath))
  view.focus()
}
