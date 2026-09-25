import type { Translate } from './due-reminders'
import { fromKg, maxWeightIn } from './weight-unit'
import { currentWeightUnit } from './weight-unit-preference'
import { formatWeight, formatWeightAxis } from '@/shared/utils/format'

/** Un poids enregistré en kg, dans l'unité choisie, sans arrondi. */
export function displayedWeight(kg: number): number {
  return fromKg(kg, currentWeightUnit())
}

/** `kg`, `lb`. */
export function weightUnitText(t: Translate): string {
  return t(`weight.unit.${currentWeightUnit()}`, {})
}

/** `kilogrammes`, `livres`. */
export function weightUnitName(t: Translate): string {
  return t(`weight.unitName.${currentWeightUnit()}`, {})
}

/** `54,0` : le chiffre seul, quand l'unité s'écrit à part. */
export function weightNumber(kg: number): string {
  return formatWeight(displayedWeight(kg))
}

/** `+0,3 lb` : un nombre déjà écrit dans l'unité choisie, suivi de celle-ci. */
export function withWeightUnit(t: Translate, value: string): string {
  return t('weight.value', { weight: value, unit: weightUnitText(t) })
}

/** `54,0 lb`. */
export function weightText(t: Translate, kg: number): string {
  return withWeightUnit(t, weightNumber(kg))
}

/** Paramètres des messages d'erreur d'un champ de poids. */
export function weightLimitParams(t: Translate): { unit: string; max: string } {
  return { unit: weightUnitText(t), max: formatWeightAxis(maxWeightIn(currentWeightUnit())) }
}
