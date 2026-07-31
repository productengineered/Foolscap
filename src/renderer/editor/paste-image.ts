import { EditorView } from '@codemirror/view'
import type { Extension } from '@codemirror/state'

/* Paste an image from the clipboard: bytes go to main, which writes them
 * into an assets/ folder beside the document and answers with a relative
 * path; the editor gets a plain markdown image link with the cursor parked
 * in the alt text. Main answers null for an unsaved document — there is no
 * "beside" yet. */

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
}

export function extForMime(mime: string): string | null {
  return EXT_BY_MIME[mime] ?? null
}

export function pasteImage(onNoDocument: () => void): Extension {
  return EditorView.domEventHandlers({
    paste: (event, view) => {
      const items = event.clipboardData?.items
      if (!items) return false
      const image = Array.from(items).find((item) => extForMime(item.type) !== null)
      const file = image?.getAsFile()
      if (!image || !file) return false
      event.preventDefault()
      void insert(view, file, extForMime(image.type) as string, onNoDocument)
      return true
    }
  })
}

async function insert(
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
  const { from } = view.state.selection.main
  view.dispatch(view.state.replaceSelection(`![](${relPath})`))
  // Park the cursor in the alt brackets.
  view.dispatch({ selection: { anchor: from + 2 } })
  view.focus()
}
