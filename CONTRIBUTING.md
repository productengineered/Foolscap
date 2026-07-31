# Contributing

Thanks for even reading this. The rules are short.

## Found a bug?

**Report it.** [Open an issue](https://github.com/seamoss/Foolscap/issues)
with your macOS version, your Foolscap version, and the smallest markdown
file that reproduces it. A bug is a crash, lost or mangled text, a wrong
render, a shortcut that doesn't. Anything that breaks the one promise —
*the file on disk is byte-for-byte what you wrote* — jumps the queue.

Bug-fix PRs are welcome too: bring a test, keep `pnpm test` and
`pnpm typecheck` green, and don't break the golden-file suite — if export
output changes by a byte, the change is wrong.

## Have a feature request?

I won't focus on it, and that's a promise, not a backlog. Foolscap's
feature set is deliberately closed — the [out of scope list](README.md#out-of-scope)
is load-bearing, and "small addition" is how every beloved tool became a
dashboard. Feature issues and feature PRs will be closed with affection.

**Fork it and build it.** That's not a brush-off — it's the license. MIT
means the app you're imagining is one `git clone` away, and I genuinely
hope it turns out great.
