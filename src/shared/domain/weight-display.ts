import { fromKg, maxWeightIn, type WeightUnit } from './weight-unit'
import { formatWeight, formatWeightAxis } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

/** Un poids enregistré en kg, dans l'unité choisie, sans arrondi. */
export function displayedWeight(unit: WeightUnit, kg: number): number {
  return fromKg(kg, unit)
}

/** `kg`, `lb`. */
export function weightUnitText(t: Translate, unit: WeightUnit): string {
  return t(`weight.unit.${unit}`, {})
}

/** `kilogrammes`, `livres`. */
export function weightUnitName(t: Translate, unit: WeightUnit): string {
  return t(`weight.unitName.${unit}`, {})
}

/** Le poids tel qu'il s'affiche : dans l'unité choisie, au dixième. */
export function shownWeight(unit: WeightUnit, kg: number): number {
  return Math.round(displayedWeight(unit, kg) * 10) / 10
}

/** `54,0` : le chiffre seul, quand l'unité s'écrit à part. */
export function weightNumber(unit: WeightUnit, kg: number): string {
  return formatWeight(shownWeight(unit, kg))
}

/** `+0,3 lb` : un nombre déjà écrit dans l'unité choisie, suivi de celle-ci. */
export function withWeightUnit(t: Translate, unit: WeightUnit, value: string): string {
  return t('weight.value', { weight: value, unit: weightUnitText(t, unit) })
}

/** `54,0 lb`. */
export function weightText(t: Translate, unit: WeightUnit, kg: number): string {
  return withWeightUnit(t, unit, weightNumber(unit, kg))
}

/** Paramètres des messages d'erreur d'un champ de poids. */
export function weightLimitParams(t: Translate, unit: WeightUnit): { unit: string; max: string } {
  return { unit: weightUnitText(t, unit), max: formatWeightAxis(maxWeightIn(unit)) }
}
