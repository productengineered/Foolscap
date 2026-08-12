import { WidgetType, type EditorView } from '@codemirror/view'
import { NOD_SRC } from './nod'

/* Collectors stay pure by describing widgets as data; this module turns the
 * descriptors into (cached) WidgetType instances. eq() is what lets CM keep
 * existing DOM across decoration rebuilds — critical for images, which would
 * otherwise re-fetch and flash on every cursor move. */

export type WidgetDesc =
  | { type: 'bullet' }
  | { type: 'hr' }
  | { type: 'image'; src: string | null; alt: string }
  | { type: 'nod' }
  | { type: 'task'; checked: boolean; at: number }

class BulletWidget extends WidgetType {
  override eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'fs-bullet'
    span.textContent = '•'
    return span
  }

  override ignoreEvent(): boolean {
    return false
  }
}

class HrWidget extends WidgetType {
  override eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'fs-hr'
    return span
  }

  override ignoreEvent(): boolean {
    return false
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly src: string | null,
    readonly alt: string
  ) {
    super()
  }

  override eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('span')
    wrap.className = 'fs-image'
    if (this.src === null) {
      wrap.append(this.brokenState())
      return wrap
    }
    const img = document.createElement('img')
    img.src = this.src
    img.alt = this.alt
    img.draggable = false
    img.addEventListener('error', () => {
      img.remove()
      wrap.append(this.brokenState())
    })
    wrap.append(img)
    return wrap
  }

  private brokenState(): HTMLElement {
    const broken = document.createElement('span')
    broken.className = 'fs-image-broken'
    broken.textContent = this.alt ? `image not found: ${this.alt}` : 'image not found'
    return broken
  }

  override ignoreEvent(): boolean {
    return false
  }
}

class NodWidget extends WidgetType {
  override eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'fs-nod'
    const img = document.createElement('img')
    img.src = NOD_SRC
    img.alt = ':yes-yes:'
    img.draggable = false
    span.append(img)
    return span
  }

  override ignoreEvent(): boolean {
    return false
  }
}

class TaskWidget extends WidgetType {
  constructor(
    private readonly checked: boolean,
    private readonly at: number
  ) {
    super()
  }

  override eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.at === this.at
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span')
    span.className = 'fs-task'
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.checked = this.checked
    box.setAttribute('aria-label', this.checked ? 'Mark task incomplete' : 'Mark task complete')
    // Don't let the editor turn the press into a cursor move — the click
    // must land on the checkbox, not park the caret inside the marker.
    box.addEventListener('mousedown', (event) => event.preventDefault())
    box.addEventListener('click', (event) => {
      event.preventDefault()
      // The buffer is the state: toggling is a three-character text edit.
      view.dispatch({
        changes: { from: this.at, to: this.at + 3, insert: this.checked ? '[ ]' : '[x]' }
      })
    })
    span.append(box)
    return span
  }
  // Default ignoreEvent() (true) stands: the widget owns its clicks.
}

const bullet = new BulletWidget()
const hr = new HrWidget()
const nod = new NodWidget()
const imageCache = new Map<string, ImageWidget>()

export function specWidget(desc: WidgetDesc): WidgetType {
  switch (desc.type) {
    case 'bullet':
      return bullet
    case 'hr':
      return hr
    case 'nod':
      return nod
    case 'task':
      return new TaskWidget(desc.checked, desc.at)
    case 'image': {
      const key = `${desc.src ?? ''}\u0000${desc.alt}`
      let cached = imageCache.get(key)
      if (!cached) {
        if (imageCache.size > 100) imageCache.clear()
        cached = new ImageWidget(desc.src, desc.alt)
        imageCache.set(key, cached)
      }
      return cached
    }
  }
}
