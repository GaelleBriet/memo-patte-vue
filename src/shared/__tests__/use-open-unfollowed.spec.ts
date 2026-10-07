import { ref } from 'vue'
import { describe, expect, it, vi } from 'vitest'

import { useOpenUnfollowed } from '../composables/use-open-unfollowed'

const push = vi.fn<(to: unknown) => Promise<void>>(async () => {})

vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

function setup(ids: string[]) {
  const unfollowed = ref(ids.map((id) => ({ id })))
  const openCarnet = vi.fn<(animalId: string) => void>()
  push.mockClear()
  return { unfollowed, openCarnet, ...useOpenUnfollowed(() => unfollowed.value, openCarnet) }
}

describe('useOpenUnfollowed', () => {
  it('AN-10 : pas de ligne sans animal qu’on ne suit plus, et rien à ouvrir', () => {
    const { entry, open, openCarnet } = setup([])

    expect(entry.value).toBeNull()
    open()

    expect(push).not.toHaveBeenCalled()
    expect(openCarnet).not.toHaveBeenCalled()
  })

  it('AN-10 : ouvre le carnet du seul animal qu’on ne suit plus', () => {
    const { entry, open, openCarnet } = setup(['luna'])

    expect(entry.value?.count).toBe(1)
    open()

    expect(openCarnet).toHaveBeenCalledWith('luna')
    expect(push).not.toHaveBeenCalled()
  })

  it('AN-10 : ouvre la liste dès deux animaux', () => {
    const { entry, open, openCarnet } = setup(['luna', 'pixel'])

    expect(entry.value?.count).toBe(2)
    open()

    expect(push).toHaveBeenCalledWith({ name: 'unfollowed-animals' })
    expect(openCarnet).not.toHaveBeenCalled()
  })

  it('suit la liste quand elle change', () => {
    const { entry, unfollowed } = setup(['luna'])

    unfollowed.value = [{ id: 'luna' }, { id: 'pixel' }, { id: 'milo' }]

    expect(entry.value?.count).toBe(3)
  })
})
