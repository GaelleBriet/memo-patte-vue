import { ref } from 'vue'

import { defaultWeightUnit, isWeightUnit, type WeightUnit } from './weight-unit'

export const WEIGHT_UNIT_STORAGE_KEY = 'memopatte.weight.unit'

const unit = ref<WeightUnit>('kg')

export function currentWeightUnit(): WeightUnit {
  return unit.value
}

/** Pour la session seulement : rien n'est retenu. */
export function applyWeightUnit(next: WeightUnit): void {
  unit.value = next
}

function savedWeightUnit(): WeightUnit | null {
  try {
    const saved = localStorage.getItem(WEIGHT_UNIT_STORAGE_KEY)
    return isWeightUnit(saved) ? saved : null
  } catch {
    return null
  }
}

/** L'unité choisie dans Paramètres, sinon celle de la région du téléphone. */
export function restoreWeightUnit(languages: readonly string[]): void {
  applyWeightUnit(savedWeightUnit() ?? defaultWeightUnit(languages))
}

export function chooseWeightUnit(next: WeightUnit): void {
  applyWeightUnit(next)
  try {
    localStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, next)
  } catch (cause) {
    console.warn('Unité de poids non retenue :', cause)
  }
}
