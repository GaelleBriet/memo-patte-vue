import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

function luminance(color: string): number {
  if (!HEX.test(color)) throw new Error(`couleur inconnue : ${color}`)
  const hex = color.length === 4 ? color.replace(/[0-9a-f]/gi, (digit) => digit + digit) : color
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

/** Rapport de contraste WCAG 2 entre deux couleurs `#rgb` ou `#rrggbb` ; lève sur tout autre format. */
export function contrastRatio(foreground: string, background: string): number {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (light! + 0.05) / (dark! + 0.05)
}

/** Couleurs hexadécimales de `_tokens.scss`, alias `$token` résolus, par nom sans `$` ; lève sur un alias introuvable. */
export function scssColorTokens(
  source = readFileSync(resolve(process.cwd(), 'src/styles/_tokens.scss'), 'utf8'),
): Record<string, string> {
  const raw = new Map<string, string>()
  for (const [, name, value] of source.matchAll(
    /^\$([\w-]+):\s*(#[0-9a-f]{6}|#[0-9a-f]{3}|\$[\w-]+);/gim,
  )) {
    raw.set(name!, value!)
  }

  const resolveToken = (value: string): string => {
    if (!value.startsWith('$')) return value.toUpperCase()
    const target = raw.get(value.slice(1))
    if (target === undefined) throw new Error(`couleur inconnue : ${value}`)
    return resolveToken(target)
  }

  return Object.fromEntries([...raw].map(([name, value]) => [name, resolveToken(value)]))
}
