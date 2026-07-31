# The Foolscap Playground

This file is yours to wreck — it's saved and gitignored, so paste-image and
external-edit tests work against a real path.

## Feel

Type anywhere. Watch marks like **these** and *these* recede when you leave
the line and come back up when you return — `140ms`, never instant, never
gone. The gutter to the left tells you what block you're inside.

> Put the cursor in and out of this quote and watch the `>` marks breathe.

## Structure

- Hit `⇧⌘O` for the outline; click around it
- `⌘K` for the palette — everything lives there
- Try `⌘K → Theme: Manuscript`, then `Theme: Plate`, then back to Auto
- Toggle Typewriter Mode, then type a long run of lines mid-document
- Toggle Focus Mode and arrow through the paragraphs below

## Things that swap on adjacency

An image (arrow into it, then out): the broken one shows its fallback —

![this path does not exist](missing-on-purpose.png)

A rule — put your cursor on the line below, then leave it:

---

1. Ordered lists keep their numbers quiet
2. Bullets become real off the line:

- like this one
- and this wrapped one, which should hang its indent so the second line of
  text aligns under the text, not under the bullet

## Code

```ts
// Shiki, same tokens as everything else
const wedge = { taste: true, features: 'no thanks' }
```

## The important ones

1. Paste a screenshot right here (`⌘⇧4 space` then `⌘V`) — it should land in
   an `assets/` folder next to this file
2. `⌘F` — the new find & replace; try the `Aa` / `.*` chips
3. `⌘N` a second window, `⌘T` a tab, drag the tab out
4. Edit this file in another editor while it's clean here (silent reload),
   then again while you have unsaved changes (reload/keep bar)
5. Export → As PDF… and hold it next to the editor
6. Quit with unsaved changes in two windows

If none of that made you think about the app, the north star is holding.
