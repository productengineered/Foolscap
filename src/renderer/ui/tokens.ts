/* JS-side timeouts and positioning can't reference a CSS custom property the
 * way a stylesheet can, so chrome code reads tokens.css through here at call
 * time — theme overrides included. tokens.css stays the single source. */

export function parseMs(value: string): number | null {
  const match = /^(-?\d*\.?\d+)(ms|s)$/.exec(value.trim())
  if (!match || match[1] === undefined) return null
  const n = Number(match[1])
  return match[2] === 's' ? n * 1000 : n
}

export function parsePx(value: string): number | null {
  const match = /^(-?\d*\.?\d+)px$/.exec(value.trim())
  return match && match[1] !== undefined ? Number(match[1]) : null
}

function read(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name)
}

export function tokenMs(name: string): number {
  return parseMs(read(name)) ?? 0
}

export function tokenPx(name: string): number {
  return parsePx(read(name)) ?? 0
}
