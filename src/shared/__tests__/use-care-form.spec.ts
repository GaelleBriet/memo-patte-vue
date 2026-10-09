import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, reactive, shallowRef } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useCareForm, type CareFormAnimal } from '../composables/use-care-form'

const replace = vi.fn<(to: unknown) => Promise<void>>(async () => undefined)
const route = { query: {} as Record<string, string> }

vi.mock('vue-router', () => ({
  useRouter: () => ({ replace, back: vi.fn(), options: { history: { state: { back: null } } } }),
  useRoute: () => route,
}))

vi.mock('@/core/notifications/permission', () => ({
  shouldShowPriming: vi.fn<() => Promise<boolean>>(async () => false),
}))

interface Soin {
  id: string
  animalId: string
}

const MILO: CareFormAnimal = { id: 'milo', name: 'Milo', unfollowedOn: null }
const LUNA: CareFormAnimal = { id: 'luna', name: 'Luna', unfollowedOn: null }
const PIXEL: CareFormAnimal = { id: 'pixel', name: 'Pixel', unfollowedOn: '2026-09-01' }

function magasin(animaux: CareFormAnimal[], hasLoaded = true) {
  const store = reactive({
    animals: hasLoaded ? animaux : ([] as CareFormAnimal[]),
    hasLoaded,
    load: vi.fn(async () => {
      store.animals = animaux
      store.hasLoaded = true
    }),
    select: vi.fn<(id: string) => void>(),
  })
  return store
}

function monter(options: {
  id?: string
  animalId?: string
  animals?: ReturnType<typeof magasin>
  load?: (id: string) => Promise<Soin | null>
  allowsUnfollowedAnimal?: boolean
}) {
  const animals = options.animals ?? magasin([MILO, LUNA, PIXEL])
  const opened = shallowRef<Soin | null>(null)
  const open = vi.fn<(loaded: Soin) => void>((loaded) => {
    opened.value = loaded
  })
  let form!: ReturnType<typeof useCareForm<Soin, CareFormAnimal>>
  mount(
    defineComponent({
      setup() {
        form = useCareForm<Soin, CareFormAnimal>({
          kind: 'vaccination',
          animals,
          id: () => options.id,
          animalId: () => options.animalId,
          openedAnimalId: () => opened.value?.animalId,
          allowsUnfollowedAnimal: () => options.allowsUnfollowedAnimal ?? false,
          load: options.load ?? (async () => null),
          open,
        })
        return () => h('div')
      },
    }),
  )
  return { form, animals, open }
}

beforeEach(() => {
  replace.mockClear()
  route.query = {}
})

describe('useCareForm — création', () => {
  it('cible l’animal de la route, sans rien charger, et permet d’enregistrer', async () => {
    const load = vi.fn<(id: string) => Promise<Soin | null>>()
    const { form } = monter({ animalId: 'milo', load })
    await flushPromises()

    expect(load).not.toHaveBeenCalled()
    expect(form.isLoading.value).toBe(false)
    expect(form.animalName.value).toBe('Milo')
    expect(form.failure.value).toBeNull()
    expect(form.canSave.value).toBe(true)
  })

  it('charge les animaux quand le store ne les a pas encore', async () => {
    const animals = magasin([MILO], false)
    const { form } = monter({ animalId: 'milo', animals })

    await flushPromises()

    expect(animals.load).toHaveBeenCalledOnce()
    expect(form.animalName.value).toBe('Milo')
  })

  it('ramène à l’origine un animal qu’on ne suit plus, sans permettre d’enregistrer', async () => {
    route.query = { from: 'home' }
    const { form, animals } = monter({ animalId: 'pixel' })
    await flushPromises()

    expect(animals.select).toHaveBeenCalledWith('pixel')
    expect(replace).toHaveBeenCalledWith({ name: 'home' })
    expect(form.canSave.value).toBe(false)
  })

  it('garde un animal qu’on ne suit plus quand l’écran l’accepte', async () => {
    const { form } = monter({
      id: 's1',
      allowsUnfollowedAnimal: true,
      load: async () => ({ id: 's1', animalId: 'pixel' }),
    })
    await flushPromises()

    expect(replace).not.toHaveBeenCalled()
    expect(form.canSave.value).toBe(true)
  })
})

describe('useCareForm — chargement du soin', () => {
  it('ouvre le soin chargé, dont l’animal prime sur celui de la route', async () => {
    const soin = { id: 's1', animalId: 'luna' }
    const { form, open } = monter({ id: 's1', animalId: 'milo', load: async () => soin })
    expect(form.isLoading.value).toBe(true)
    expect(form.canSave.value).toBe(false)

    await flushPromises()

    expect(open).toHaveBeenCalledWith(soin)
    expect(form.isLoading.value).toBe(false)
    expect(form.animalName.value).toBe('Luna')
    expect(form.canSave.value).toBe(true)
  })

  it('dit le soin introuvable', async () => {
    const { form, open } = monter({ id: 's1', animalId: 'milo', load: async () => null })
    await flushPromises()

    expect(open).not.toHaveBeenCalled()
    expect(form.failure.value).toBe('notFound')
    expect(form.canSave.value).toBe(false)
  })

  it('dit l’échec du chargement', async () => {
    const { form } = monter({
      id: 's1',
      animalId: 'milo',
      load: async () => {
        throw new Error('base indisponible')
      },
    })
    await flushPromises()

    expect(form.loadFailed.value).toBe(true)
    expect(form.failure.value).toBe('load')
    expect(form.isLoading.value).toBe(false)
    expect(form.canSave.value).toBe(false)
  })
})

describe('useCareForm — enregistrement', () => {
  it('écrit une fois, sélectionne l’animal puis revient à l’origine', async () => {
    route.query = { from: 'settings' }
    const { form, animals } = monter({ animalId: 'milo' })
    await flushPromises()
    const write = vi.fn(async () => undefined)

    await form.save(write, true)

    expect(write).toHaveBeenCalledOnce()
    expect(form.isSaved.value).toBe(true)
    expect(form.isSubmitting.value).toBe(false)
    expect(form.canSave.value).toBe(false)
    expect(animals.select).toHaveBeenCalledWith('milo')
    expect(replace).toHaveBeenCalledWith({ name: 'settings' })
  })

  it('ne fait rien quand il n’y a rien à écrire, et efface l’échec précédent', async () => {
    const { form } = monter({ animalId: 'milo' })
    await flushPromises()
    await form.save(() => Promise.reject(new Error('disque plein')), true)
    expect(form.failure.value).toBe('save')

    await form.save(() => null, true)

    expect(form.failure.value).toBeNull()
    expect(form.isSaved.value).toBe(false)
    expect(form.isSubmitting.value).toBe(false)
    expect(replace).not.toHaveBeenCalled()
  })

  it('dit l’échec de l’écriture et reste sur l’écran', async () => {
    const { form, animals } = monter({ animalId: 'milo' })
    await flushPromises()

    await form.save(() => {
      throw new Error('formulaire ouvert sans animal')
    }, false)

    expect(form.failure.value).toBe('save')
    expect(form.isSaved.value).toBe(false)
    expect(form.canSave.value).toBe(true)
    expect(animals.select).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('tient isSubmitting pendant l’écriture', async () => {
    const { form } = monter({ animalId: 'milo' })
    await flushPromises()
    let finish: () => void = () => {}

    const saving = form.save(() => new Promise<void>((resolve) => (finish = resolve)), true)
    expect(form.isSubmitting.value).toBe(true)
    finish()
    await saving

    expect(form.isSubmitting.value).toBe(false)
  })
})
