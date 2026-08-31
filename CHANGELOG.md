# Changelog

This fork of [seamoss/Foolscap](https://github.com/seamoss/Foolscap) adds
layout and multi-document features on top of upstream. Upstream's rule that
the buffer is always plain markdown text is preserved throughout — every
feature below round-trips through standard GFM.

## 0.16.0 — 2026-08-31

### Line numbers

- **Line numbers** (off by default — Settings ▸ Writing, View ▸ Toggle
  Line Numbers, or the palette). Quiet mono ordinals in the margin, one
  per source line: a wrapped paragraph keeps its single number, and the
  block-glyph column keeps its place beside the text. Editor only — the
  preview renders blocks, not source lines, so it stays a clean page.

## 0.15.0 — 2026-08-26

### Autosave, version history, and undo that survives a restart

- **Autosave** (on by default; Settings ▸ Saving turns it off). A saved
  document writes itself: ~1.5s after typing pauses, every 30s through an
  unbroken burst, and immediately when the tab, window, or app leaves the
  foreground. Closing a file-backed tab just saves instead of asking, and
  ⌘Q flushes every file before persisting the session. Untitled documents
  are untouched — they still live as drafts until a deliberate first save.
  Autosave never writes over an unresolved external change (the conflict
  bar keeps the last word), and a failing disk toasts once, not per
  keystroke.
- **Version history** (File ▸ Browse Versions…, also in the palette).
  Autosave removes "just don't save" as the undo of last resort, so
  Foolscap now keeps full snapshots of each document in its app data —
  never beside your files, never synced anywhere. The first save of a
  session snapshots the file *as you found it* before anything overwrites
  it; further snapshots land at most every 5 minutes, and old ones thin
  out Time-Machine style (hourly for a day, daily for a month, weekly
  beyond). The browser lists times, shows any snapshot, and Restore
  replaces the buffer as a single edit — ⌘Z undoes a restore like any
  other change; the disk only moves when the normal save path runs.
- **Persistent undo.** The undo stack now rides along with the persisted
  session and with tabs dragged to another window, so after a quit-and-
  relaunch ⌘Z still walks back through the previous session's edits.

## 0.14.1 — 2026-08-25

### ⌘F works everywhere, not just with the editor focused

- ⌘F was bound only inside CodeMirror, so it did nothing in preview mode —
  including right after opening a file, which lands in preview. A global
  handler now catches ⌘F anywhere (preview, help, outline), leaves whatever
  overlay is up, and opens Find & Replace — same as the palette's
  Find & Replace entry always did.
- Pressing ⌘F with the panel already open now refocuses and reselects the
  query (and seeds it from the current selection), instead of silently
  doing nothing.

## 0.14.0 — 2026-08-25

### Double-click in preview lands the cursor on the clicked word

- Double-clicking a rendered block used to drop the cursor at the block's
  first character. The click point now maps back to the exact source offset:
  the clicked word is found in the markdown by whole-word occurrence, past
  whatever syntax the preview hides (`**` marks, link URLs, heading `#`s),
  and the cursor lands mid-word right where you clicked.
- The page-hold from 0.13.2 sharpened with it: the *clicked line* keeps its
  screen height, not just the block — a wrapped paragraph no longer shifts
  by the lines above the click.
- When the word can't be found in the source (say it's assembled from
  pieces, like `win**ning**`), the exit falls back to the block start as
  before.

## 0.13.2 — 2026-08-25

### Leaving preview no longer jumps the page

- Double-clicking a block in preview used to center that block's first line
  in the editor, so the text leapt to the middle of the window and you had
  to find your place again. The clicked element's on-screen height now rides
  along with the exit: its line lands where the element was, and the page
  holds still under the click.
- ⌘E and Escape get the same treatment — the block at the viewport center
  used to be re-centered on its *first* line (a jump, for any block taller
  than one line); it now stays at the height it was on screen.

## 0.13.1 — 2026-08-14

### The title bar has room to breathe

- The bar was sized to the traffic lights, but macOS parks those low within
  it, which left the tabs and the document title pressed against the content
  below and only a few pixels under the buttons. It's deeper now, and the tab
  strip starts further clear of the buttons. Both are single values in
  `tokens.css`; everything under the chrome keys off them.

## 0.13.0 — 2026-08-14

### Files from outside reuse the window on your desktop

- 0.12.0 opened every externally-opened file in a new window, because
  nothing in Electron answers "which desktop is this window on". Windows
  piled up. They now land as tabs in a Foolscap window already on the
  desktop you're looking at, and only make a new window when there isn't
  one.
- The desktop is read from the window itself: macOS marks windows on other
  Spaces as occluded, which Chromium reports as a hidden document. Seeing a
  window proves it's here — you cannot see a window on another Space —
  while not seeing one is ambiguous, so the check is only ever trusted in
  the affirmative. Being wrong costs an extra window, never a desktop
  switch.

## 0.12.0 — 2026-08-14

### Files open on the desktop you're actually on

- Double-clicking a file in Finder, or `open`ing one from a terminal, used
  to hand it to whichever window last had focus — and if that window lived
  on another macOS Space, focusing it dragged your screen there with it.
  Files arriving from outside the app now open in a new window instead,
  which lands on the desktop you're currently on. Windows on other desktops
  stay where you left them.
- Selecting several files at once still gives you one window, with a tab
  each — the burst of events is gathered before the window is made.
- A file that's already open still activates its existing tab wherever that
  lives, rather than opening a second copy: one file, one buffer, one
  watcher. When that's the only thing you asked for, its window is focused,
  desktop switch and all.
- Opening from inside the app (⌘O, the palette) is unchanged — the window
  you're working in is on your desktop by definition, and the file lands
  there as a tab.

## 0.11.0 — 2026-08-14

Forked from upstream v0.10.1.

### Tabs and multiple windows

- One window now holds many documents. The tab strip lives in the titlebar
  and disappears entirely for single-document windows, which look exactly
  as before.
- **⌘T** opens a tab, **⌘W** closes one (the window when it's the last),
  **⇧⌘W** closes the window, **⌃Tab / ⌃⇧Tab** cycle. Click to switch, drag
  horizontally to reorder.
- **Drag a tab out** — pull it past the strip and release — and it becomes
  its own window at the drop point. The buffer, undo history, dirty flag,
  and disk watcher all travel with it.
- Opening a file lands as a tab in the window that was last in focus; a
  file that's already open anywhere activates its existing tab instead of
  duplicating.
- Closing a window walks a save prompt through every dirty tab.
- ⌘Q session persistence remembers windows *and* their tabs (older
  single-document sessions migrate automatically).

### Resizable table columns

- A column's width is recorded as the dash run in its delimiter row —
  still a perfectly standard GFM table everywhere, and the width travels
  with the file. Minimal hand-typed delimiters (`---`, `:---:`) carry no
  intent and size by content, unchanged.
- **In preview (⌘E):** tables lay out with columns proportioned by their
  recorded widths. Hover a column boundary for the resize cursor and drag
  to redistribute the two neighbors; a column narrower than its content
  wraps. Resizes write back to the markdown source.
- **In the editor:** every pipe is a grab handle (col-resize cursor, drags
  in character steps), and the table chip bar gains ⇤ / ⇥ narrow/widen
  buttons.

### Layout

- The text column tracks the window width instead of the fixed 68ch cap,
  keeping a `min(6rem, 5vw)` margin at each edge. Exports keep the fixed
  measure — print has no window to track.

### Fixes

- Leaving preview (⌘E, Escape) lands the editor on the content you were
  scrolled to, cursor placed and centered — not at the top of the
  document. (Double-click already did this; now every exit path does.)

### Fork housekeeping

- The background auto-updater is off: it would poll the upstream feed
  unprompted and auto-download upstream releases over this fork's
  features. The manual "Check for Updates" stays. Opt the background
  updater back in with `FOOLSCAP_AUTO_UPDATE=1`.
