import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useSameNameCheck } from '../composables/use-same-name-check'
import type { Vaccination } from '../schema/vaccination.schema'

type Find = (animalId: string, name: string) => Promise<Vaccination | null>

const existing = { id: 'v1', name: 'CHPPiL' } as Vaccination

function setup(find: Find) {
  const animalId = ref<string | undefined>('luna')
  const name = ref('CHPPiL')
  const check = useSameNameCheck({ find, animalId: () => animalId.value, name: () => name.value })
  return { animalId, name, check }
}

describe('useSameNameCheck', () => {
  it('laisse enregistrer quand aucun vaccin du même nom n’existe', async () => {
    const { check } = setup(async () => null)

    expect(await check.isNewName()).toBe(true)
    expect(check.isDialogOpen.value).toBe(false)
    expect(check.isChecking.value).toBe(false)
  })

  it('ouvre le dialogue et garde le vaccin trouvé', async () => {
    const find = vi.fn<Find>(async () => existing)
    const { check } = setup(find)

    expect(await check.isNewName()).toBe(false)
    expect(find).toHaveBeenCalledWith('luna', 'CHPPiL')
    expect(check.isDialogOpen.value).toBe(true)
    expect(check.sameName.value).toEqual(existing)
  })

  it('ne cherche pas sans animal ni nom, et laisse enregistrer', async () => {
    const find = vi.fn<Find>(async () => existing)
    const { animalId, name, check } = setup(find)
    animalId.value = undefined
    expect(await check.isNewName()).toBe(true)
    animalId.value = 'luna'
    name.value = '  '
    expect(await check.isNewName()).toBe(true)
    expect(find).not.toHaveBeenCalled()
  })

  it('laisse enregistrer quand la recherche échoue', async () => {
    const { check } = setup(async () => {
      throw new Error('base')
    })

    expect(await check.isNewName()).toBe(true)
    expect(check.isChecking.value).toBe(false)
  })
})
