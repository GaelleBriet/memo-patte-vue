import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function luminance(color: string): number {
  const hex = color.length === 4 ? color.replace(/[0-9a-f]/gi, (digit) => digit + digit) : color
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** Rapport de contraste WCAG 2 entre deux couleurs `#rgb` ou `#rrggbb`. */
export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (light! + 0.05) / (dark! + 0.05)
}

/** Couleurs `#rrggbb` de `src/styles/_tokens.scss`, alias `$token` résolus, par nom sans `$`. */
export function scssColorTokens(): Record<string, string> {
  const source = readFileSync(resolve(process.cwd(), 'src/styles/_tokens.scss'), 'utf8')
  const raw = new Map<string, string>()
  for (const [, name, value] of source.matchAll(/^\$([\w-]+):\s*(#[0-9a-f]{6}|\$[\w-]+);/gim)) {
    raw.set(name!, value!)
  }

  const resolveToken = (value: string): string =>
    value.startsWith('$') ? resolveToken(raw.get(value.slice(1)) ?? '') : value.toUpperCase()

  return Object.fromEntries([...raw].map(([name, value]) => [name, resolveToken(value)]))
}
