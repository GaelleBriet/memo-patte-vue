import { ref } from 'vue'

import type { Vaccination } from '../schema/vaccination.schema'

type SameNameCheckOptions = {
  find: (animalId: string, name: string) => Promise<Vaccination | null>
  animalId: () => string | undefined
  name: () => string
}

export function useSameNameCheck({ find, animalId, name }: SameNameCheckOptions) {
  const sameName = ref<Vaccination | null>(null)
  const isDialogOpen = ref(false)
  const isChecking = ref(false)

  async function lookUp(): Promise<Vaccination | null> {
    const id = animalId()
    if (id === undefined || name().trim() === '') return null
    try {
      return await find(id, name())
    } catch {
      return null
    }
  }

  async function isNewName(): Promise<boolean> {
    isChecking.value = true
    sameName.value = await lookUp()
    isChecking.value = false
    if (sameName.value === null) return true
    isDialogOpen.value = true
    return false
  }

  return { sameName, isDialogOpen, isChecking, isNewName }
}
