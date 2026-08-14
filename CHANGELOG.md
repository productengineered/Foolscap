# Changelog

This fork of [seamoss/Foolscap](https://github.com/seamoss/Foolscap) adds
layout and multi-document features on top of upstream. Upstream's rule that
the buffer is always plain markdown text is preserved throughout — every
feature below round-trips through standard GFM.

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
