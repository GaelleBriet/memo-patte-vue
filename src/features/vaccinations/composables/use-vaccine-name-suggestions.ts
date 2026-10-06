import { computed, ref, watch, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  carnetVaccineNames,
  labelledCombinations,
  suggestVaccineNames,
  usedForText,
  type CarnetVaccineName,
} from '../logic/vaccine-suggestions'
import { useVaccinationsStore } from '../store/vaccinations.store'
import type { AnimalSpecies } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'

/** Propositions de VA-4 pour le nom tapé ; un carnet illisible laisse les seules combinaisons. */
export function useVaccineNameSuggestions(name: Ref<string>, species: Ref<AnimalSpecies | null>) {
  const { t } = useI18n()
  const animals = useAnimalsStore()
  const vaccinations = useVaccinationsStore()
  const carnet = ref<CarnetVaccineName[]>([])

  watch(
    species,
    async (current) => {
      carnet.value = []
      if (current === null) return
      try {
        carnet.value = carnetVaccineNames(await vaccinations.listAll(), animals.animals, current)
      } catch {
        carnet.value = []
      }
    },
    { immediate: true },
  )

  const combinations = computed(() =>
    species.value === null ? [] : labelledCombinations(t, species.value),
  )
  const suggestions = computed(() =>
    suggestVaccineNames(name.value, carnet.value, combinations.value),
  )
  const hasSuggestions = computed(
    () => suggestions.value.carnet.length + suggestions.value.combinations.length > 0,
  )

  return {
    suggestions,
    hasSuggestions,
    usedFor: (animalNames: readonly string[]) => usedForText(t, animalNames),
  }
}
