# wtf is this?

**Foolscap** is a markdown editor. Free, open source, file-first, and
unreasonably well-typeset. You are reading its help file, which is — of
course — a markdown document, rendered by the same engine that renders
everything else.

The whole idea fits in one sentence: *a beautiful place to write a plain
text file that never, ever mangles it.*

## The one promise

Your document is **plain markdown text at all times**. There is no hidden
document model, no conversion, no round-trip. What's in the buffer is
byte-for-byte what's in the file. The pretty rendering you see while
editing is a costume laid *over* the text — the text itself is never
touched. This makes the classic "my editor corrupted my file" bug
structurally impossible, and it means every other tool on earth can read
what Foolscap writes.

## The signature

Most live-preview editors hide markdown syntax when you leave a line and
pop it back when you return. Foolscap doesn't hide — it **recedes**. The
`**marks**` fade to a ghost of themselves, still there, still telling you
what the structure is, and breathe back up when your cursor arrives.
Nothing jumps. Nothing flickers. The gutter to the left of the text quietly
shows what kind of block you're inside.

## Getting around

Everything lives in the command palette — press `⌘K` and type.

| Keys | What happens |
| ---- | ------------ |
| `⌘K` | Command palette — everything is in here |
| `⌘E` | Toggle preview (the fully rendered document) |
| `⌘F` | Find & replace, regex optional |
| `⇧⌘O` | Outline panel — headings, click to jump |
| `⌘N` | New window — every document gets its own |
| `⌘O` | Open a file (or just drop one on the window) |
| `⌘S` | Save (atomic: your file is never half-written) |
| `⌘P` | Print |
| `⌘,` | Settings — theme, font, text size |
| `⌘+` / `⌘−` | Text larger / smaller (`⌘0` resets) |
| `⇧⌘/` | This document |

Opening an existing file lands in **preview** — the rendered page.
Double-click anywhere to drop into the editor exactly there. `⌘E` or
`Escape` flips back and forth.

## Writing

- **Tables** — `Tab` walks cells, `Enter` adds a row, hovering shows
  column controls. Leave a table and Foolscap tidies its pipes into
  aligned columns — in the file itself, so it's tidy everywhere.
- **Images** — paste a screenshot; it lands in an `assets/` folder next to
  your document with a relative link. Arrow into an image to see its
  markdown; arrow out to see the picture.
- **Links** — `⌘`-click opens them in your browser.
- **Code** — fences highlight with real grammars, set in Ioskeley Mono.

## Appearance

`⌘,` opens Settings; the same knobs also live in `⌘K`. Seven themes,
from the house **Ledger** and **Plate** to **GitHub**, **Vercel**, and
**VS Code** — or *Load Custom…* to point at a CSS file of your own. Ten
crisp faces, five serif and five sans; your pick carries the whole page,
while code keeps its mono. **Typewriter mode** keeps the line you're
typing vertically centered; **focus mode** dims everything but the
paragraph you're in; the word count whispers in the corner when you move
the mouse.

## Leaving

- `⌘W` closes a window and **asks** about unsaved changes — closing is a
  decision about that document.
- `⌘Q` quits **silently** — every open window, including unsaved drafts,
  is remembered and comes back the next time you open Foolscap. Quitting
  is just stepping away from the desk.

Drafts are kept beside your files, never written into them. A `.md` on
disk changes only when you explicitly save.

## Why does this exist?

With love to the neighbors: **Typora** is genuinely lovely, right up
until the license nag clears its throat — again — between you and your
own file. **MacDown** put a preview pane next to a text pane in 2014 and
has been catching its breath ever since. Both collected features faster
than they collected polish. Foolscap takes the opposite trade: fewer
features, more finish, free forever, and it will never once interrupt
your writing to talk about itself. (This page doesn't count. You asked.)

## What it will never do

No vaults. No sync, cloud, or accounts. No telemetry. No graph view, no
backlinks, no plugins, no AI. There are forty apps that do those things.
This one is about writing.

---

Set in **Recursive** and **Fraunces**, with code in **Ioskeley Mono**.
MIT licensed — the source is yours too.
