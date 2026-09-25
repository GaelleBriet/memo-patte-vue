import { MAX_WEIGHT_KG } from './weight-bounds'

export const WEIGHT_UNITS = ['kg', 'lb'] as const

export type WeightUnit = (typeof WEIGHT_UNITS)[number]

/** Valeur légale de la livre internationale. */
export const KG_PER_LB = 0.45359237

// Au-delà du centième, il ne reste que le bruit de la conversion.
const RECORDED_DECIMALS = 2

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === 'kg' || value === 'lb'
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB
}

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value * KG_PER_LB
}

/** Plus grand dixième de l'unité qui reste sous la borne de la base (200 kg, 440,9 lb). */
export function maxWeightIn(unit: WeightUnit): number {
  return Math.floor(roundTo(fromKg(MAX_WEIGHT_KG, unit), 6) * 10) / 10
}

/** Au-delà de la borne annoncée (440,9 lb), sauf le poids enregistré rendu tel quel. */
export function exceedsMaxWeight(
  value: number | null,
  unit: WeightUnit,
  storedKg: number | null,
): boolean {
  if (value === null || (storedKg !== null && recordedWeightIn(storedKg, unit) === value)) {
    return false
  }
  return value > maxWeightIn(unit)
}

/** Poids enregistré dans l'unité, au centième, pour le corriger ou l'exporter en CSV. */
export function recordedWeightIn(kg: number, unit: WeightUnit): number {
  return roundTo(fromKg(kg, unit), RECORDED_DECIMALS)
}

/** Poids à enregistrer ; la valeur proposée, rendue telle quelle, garde le poids enregistré. */
export function weightKgFromInput(
  value: number | null,
  unit: WeightUnit,
  storedKg: number | null,
): number | null {
  if (value === null) return null
  if (storedKg !== null && recordedWeightIn(storedKg, unit) === value) return storedKg
  return toKg(value, unit)
}

/** Livres si la région de la première langue du téléphone est les États-Unis, kilos sinon. */
export function defaultWeightUnit(languages: readonly string[]): WeightUnit {
  const subtags = languages[0]?.split(/[-_]/).slice(1) ?? []
  const region = subtags.find((subtag) => /^([a-z]{2}|\d{3})$/i.test(subtag))
  return region?.toUpperCase() === 'US' ? 'lb' : 'kg'
}
