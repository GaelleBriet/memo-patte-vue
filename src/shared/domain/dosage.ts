import { currentLocale, type AppLocale } from '@/core/i18n'
import { formatQuantity } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export const DOSE_UNITS = [
  'tablet',
  'capsule',
  'pipette',
  'collar',
  'ml',
  'drop',
  'g',
  'sachet',
  'spray',
  'application',
  'dose',
] as const

export type DoseUnit = (typeof DOSE_UNITS)[number]

export type Dosage = { doseQuantity: number | null; doseUnit: DoseUnit | null }

/** Raccourcis du champ quantité pour les comprimés. */
export const TABLET_SHORTCUTS = [0.25, 0.5, 0.75, 1, 1.5] as const

const NBSP = '\u00a0'
const FRACTIONS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' }

/** `½`, `1 ½` pour un comprimé qui tombe sur un quart ; `0,3` sinon. */
export function formatDoseQuantity(quantity: number, unit: DoseUnit): string {
  const whole = Math.floor(quantity)
  const fraction = unit === 'tablet' ? FRACTIONS[quantity - whole] : undefined
  if (fraction === undefined) return formatQuantity(quantity)
  return whole === 0 ? fraction : `${whole}${NBSP}${fraction}`
}

const takesPlural: Record<AppLocale, (quantity: number) => boolean> = {
  fr: (quantity) => quantity >= 2,
  en: (quantity) => quantity > 1,
}

/** `comprimé`, `comprimés` à partir de deux ; `tablets` au-delà d’un. */
export function doseUnitText(t: Translate, unit: DoseUnit, quantity: number): string {
  return t(`dosage.unit.${unit}`, {}, takesPlural[currentLocale()](quantity) ? 2 : 1)
}

/** `½ comprimé`, `0,3 ml` ; `null` sans posologie. */
export function dosageText(t: Translate, { doseQuantity, doseUnit }: Dosage): string | null {
  if (doseQuantity === null || doseUnit === null) return null
  return t(
    'dosage.value',
    {
      quantity: formatDoseQuantity(doseQuantity, doseUnit),
      unit: doseUnitText(t, doseUnit, doseQuantity),
    },
    1,
  )
}
