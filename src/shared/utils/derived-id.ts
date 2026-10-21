const SEEDS = [0x811c9dc5, 0x050c5d1f, 0x2e8b6a3d, 0x6c078965]

function fnv1a(text: string, seed: number): number {
  let hash = seed
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** UUID (version 8) toujours le même pour un même identifiant et un même suffixe. */
export function derivedId(id: string, suffix: string): string {
  const hex = SEEDS.map((seed) =>
    fnv1a(`${id}:${suffix}`, seed).toString(16).padStart(8, '0'),
  ).join('')
  const variant = ((Number.parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `8${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join('-')
}
