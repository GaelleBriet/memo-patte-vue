import { formatDoseQuantity, TABLET_SHORTCUTS, type DoseUnit } from '@/shared/domain/dosage'

const FRACTION_VALUES: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75 }

/** `0,5`, `0.5`, `½`, `1 ½` ; `null` pour un champ vide, `NaN` pour une saisie illisible. */
export function parseDoseQuantity(text: string): number | null {
  const trimmed = text.replaceAll('\u00a0', ' ').trim()
  if (trimmed === '') return null
  const fraction = /^(\d+)?\s*([¼½¾])$/.exec(trimmed)
  if (fraction) return Number(fraction[1] ?? 0) + (FRACTION_VALUES[fraction[2] ?? ''] ?? 0)
  return /^\d+([.,]\d+)?$/.test(trimmed) ? Number(trimmed.replace(',', '.')) : Number.NaN
}

/** La quantité saisie, récrite pour l'unité choisie : `0,5` devient `½` pour un comprimé. */
export function doseQuantityTextFor(text: string, unit: DoseUnit | null): string {
  const quantity = parseDoseQuantity(text)
  if (quantity === null || Number.isNaN(quantity) || unit === null) return text
  return formatDoseQuantity(quantity, unit)
}

export type DoseShortcut = { value: number; label: string }

/** `¼ ½ ¾ 1 1 ½` : les raccourcis de quantité des comprimés. */
export function tabletShortcuts(): DoseShortcut[] {
  return TABLET_SHORTCUTS.map((value) => ({ value, label: formatDoseQuantity(value, 'tablet') }))
}
