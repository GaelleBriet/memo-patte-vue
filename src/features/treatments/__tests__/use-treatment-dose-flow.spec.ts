import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { computed, defineComponent, ref } from 'vue'

import { dose, period, treatment } from './treatment-fixtures'
import { useTreatmentDoseFlow, type DoseFlowExits } from '../composables/use-treatment-dose-flow'
import { useTreatmentGestures } from '../composables/use-treatment-gestures'
import { DoseAlreadyLoggedError } from '../logic/treatment-dose-writes'
import { treatmentScheduleOf } from '../logic/treatment-schedule-adapter'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { AppliedDoseChange } from '../service/treatment-doses.service'
import { useTreatmentsStore } from '../store/treatments.store'
import i18n from '@/core/i18n'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { dismissToast, toastMessage, toastTone } from '@/shared/utils/toast'

const TODAY = '2026-09-28'

const LUNA: Animal = {
  id: 'luna',
  name: 'Luna',
  species: 'cat',
  breed: null,
  birthDate: '2024-03-12',
  birthDateApproximate: false,
  photoPath: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
  unfollowedOn: null,
  departureReason: null,
  departureDate: null,
}

/** Quotidien, dernière prise le 2 sept. : 25 doses non renseignées le 28. */
const PANACUR: TreatmentWithHistory = {
  ...treatment([period()], [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')]),
  name: 'Panacur',
}

const APPLIED: AppliedDoseChange = {
  animalId: LUNA.id,
  undo: [{ action: 'delete', id: 'p1' }],
  alreadyGivenOn: null,
  postponement: null,
  finishes: false,
  moved: null,
  shiftKept: false,
}

let apply: MockInstance<ReturnType<typeof useTreatmentsStore>['applyDoseAction']>
let stop: MockInstance<ReturnType<typeof useTreatmentsStore>['stop']>

beforeEach(() => {
  setActivePinia(createPinia())
  const animals = useAnimalsStore()
  animals.animals = [LUNA]
  animals.hasLoaded = true
  const treatments = useTreatmentsStore()
  apply = vi.spyOn(treatments, 'applyDoseAction').mockResolvedValue(APPLIED)
  stop = vi.spyOn(treatments, 'stop').mockResolvedValue({
    animalId: LUNA.id,
    stopped: true,
    finished: true,
    undo: [],
  })
})

afterEach(() => {
  dismissToast()
  vi.restoreAllMocks()
})

function flow(exits: Partial<DoseFlowExits> = {}, history: TreatmentWithHistory | null = PANACUR) {
  let result: ReturnType<typeof useTreatmentDoseFlow> | undefined
  mount(
    defineComponent({
      setup() {
        const current = ref(history)
        const today = ref(TODAY)
        const schedule = computed(() =>
          current.value ? treatmentScheduleOf(current.value, today.value) : null,
        )
        result = useTreatmentDoseFlow(
          { treatment: current, schedule, today },
          useTreatmentGestures(() => {}),
          { stopFailure: 'toast', ...exits },
        )
        return () => null
      },
    }),
    { global: { plugins: [i18n] } },
  )
  return result!
}

function premiereDose() {
  const [due] = flow().unlogged.value!.dues
  return due!
}

describe('useTreatmentDoseFlow — ce que montrent la fiche et la feuille', () => {
  it('nomme le traitement et son animal, et annonce les doses à renseigner', () => {
    const { named, unlogged, stopping } = flow()

    expect(named.value).toEqual({ name: 'Panacur', animal: 'Luna' })
    expect(unlogged.value?.dues).toHaveLength(25)
    expect(stopping.value?.dues).toHaveLength(25)
  })

  it('sans traitement, rien à renseigner ni à arrêter', () => {
    const { named, unlogged, stopping } = flow({}, null)

    expect(named.value).toEqual({ name: '', animal: '' })
    expect(unlogged.value).toBeNull()
    expect(stopping.value).toBeNull()
  })
})

describe('useTreatmentDoseFlow — « C’est fait »', () => {
  it('note la prise, la confirme par un toast et rend la main à l’écran', async () => {
    const settled = vi.fn<() => void>()
    const { note } = flow({ settled })
    const due = premiereDose()

    const noted = await note({ kind: 'given', due, givenOn: due.dueOn })

    expect(noted).toBe(true)
    expect(apply).toHaveBeenCalledWith(PANACUR.id, {
      kind: 'note',
      gesture: { kind: 'given', due, givenOn: due.dueOn },
    })
    expect(toastMessage.value).toContain('Panacur')
    expect(settled).toHaveBeenCalledOnce()
  })

  it('un échec se dit en toast, l’écran reste tel quel', async () => {
    apply.mockRejectedValue(new Error('base'))
    const settled = vi.fn<() => void>()
    const { note } = flow({ settled })
    const due = premiereDose()

    expect(await note({ kind: 'given', due, givenOn: due.dueOn })).toBe(false)
    expect(toastTone.value).toBe('error')
    expect(settled).not.toHaveBeenCalled()
  })
})

describe('useTreatmentDoseFlow — renseigner les doses', () => {
  it('« Toutes données » note le lot d’un geste', async () => {
    const settled = vi.fn<() => void>()
    const { onUnloggedAction } = flow({ settled })

    onUnloggedAction('all-given')
    await flushPromises()

    const [, action] = apply.mock.calls[0]!
    expect(action.kind).toBe('log')
    expect(action.kind === 'log' && action.gestures).toHaveLength(25)
    expect(settled).toHaveBeenCalledOnce()
  })

  it('« Choisir les jours » ouvre le choix, qui se ferme une fois les jours notés', async () => {
    const result = flow()
    const { dues } = result.unlogged.value!

    result.onUnloggedAction('choose-days')
    expect(result.isChooseDaysOpen.value).toBe(true)
    expect(result.choosing.value).toBe('log')
    expect(result.chosen.value?.dues).toEqual(dues)
    expect(result.chooseDaysSubtitleText.value).toContain('Panacur')

    result.confirmChosenDays({ given: dues.slice(0, 1), missed: dues.slice(1) })
    await flushPromises()

    expect(apply).toHaveBeenCalledOnce()
    expect(result.isChooseDaysOpen.value).toBe(false)
  })

  it('un lot raté laisse le choix ouvert', async () => {
    apply.mockRejectedValue(new Error('base'))
    const settled = vi.fn<() => void>()
    const result = flow({ settled })
    const { dues } = result.unlogged.value!

    result.onUnloggedAction('choose-days')
    result.confirmChosenDays({ given: dues, missed: [] })
    await flushPromises()

    expect(result.isChooseDaysOpen.value).toBe(true)
    expect(settled).not.toHaveBeenCalled()
  })
})

describe('useTreatmentDoseFlow — arrêter', () => {
  it('arrête et rend la main à l’écran', async () => {
    const settled = vi.fn<() => void>()
    const { stop: arreter } = flow({ settled })

    await arreter()

    expect(stop).toHaveBeenCalledWith(PANACUR.id, [])
    expect(settled).toHaveBeenCalledOnce()
  })

  it('fiche : un arrêt raté se dit en toast', async () => {
    stop.mockRejectedValue(new Error('base'))
    const { stop: arreter, stopError } = flow({ stopFailure: 'toast' })

    await arreter()

    expect(toastMessage.value).toBe('Le traitement n’a pas pu être arrêté. Réessaie.')
    expect(stopError.value).toBeNull()
  })

  it('feuille : un arrêt raté se dit dans un message, sans toast', async () => {
    stop.mockRejectedValue(new Error('base'))
    const { stop: arreter, stopError } = flow({ stopFailure: 'message' })

    await arreter()

    expect(toastMessage.value).toBeNull()
    expect(stopError.value).toBe('Le traitement n’a pas pu être arrêté. Réessaie.')
  })

  it('« Choisir les jours » puis arrêter renseigne et arrête d’un geste', async () => {
    const settled = vi.fn<() => void>()
    const result = flow({ settled })
    const dues = result.stopping.value!.dues

    result.onStopAction('choose-days')
    expect(result.choosing.value).toBe('stop')
    result.confirmChosenDays({ given: dues, missed: [] })
    await flushPromises()

    expect(stop).toHaveBeenCalledWith(PANACUR.id, expect.any(Array))
    expect(stop.mock.calls[0]![1]).toHaveLength(25)
    expect(result.isChooseDaysOpen.value).toBe(false)
    expect(settled).toHaveBeenCalledOnce()
  })

  it('feuille : renseigner puis arrêter, raté, garde le choix ouvert et le dit', async () => {
    stop.mockRejectedValue(new Error('base'))
    const result = flow({ stopFailure: 'message' })

    result.onStopAction('choose-days')
    result.confirmChosenDays({ given: result.stopping.value!.dues, missed: [] })
    await flushPromises()

    expect(result.isChooseDaysOpen.value).toBe(true)
    expect(result.stopError.value).toBe('Le traitement n’a pas pu être arrêté. Réessaie.')
  })
})

describe('useTreatmentDoseFlow — un geste à la fois', () => {
  it('pendant une prise en cours, arrêter ou renseigner puis arrêter ne part pas', async () => {
    let finish: (change: AppliedDoseChange) => void = () => {}
    apply.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const result = flow({ stopFailure: 'message' })
    const due = premiereDose()
    const pending = result.note({ kind: 'given', due, givenOn: due.dueOn })

    result.onStopAction('choose-days')
    await result.stop()
    result.confirmChosenDays({ given: result.stopping.value!.dues, missed: [] })
    await flushPromises()

    expect(stop).not.toHaveBeenCalled()
    expect(toastMessage.value).toBeNull()
    expect(result.stopError.value).toBeNull()
    expect(result.isChooseDaysOpen.value).toBe(true)

    finish(APPLIED)
    await pending
  })
})

describe('useTreatmentDoseFlow — doses déjà notées ailleurs (liste périmée)', () => {
  it('renseigner : le choix des jours se ferme, et la feuille avec', async () => {
    apply.mockRejectedValue(new DoseAlreadyLoggedError())
    const settled = vi.fn<() => void>()
    const result = flow({ settled, stopFailure: 'message' })
    const { dues } = result.unlogged.value!

    result.onUnloggedAction('choose-days')
    result.confirmChosenDays({ given: dues, missed: [] })
    await flushPromises()

    expect(result.isChooseDaysOpen.value).toBe(false)
    expect(settled).toHaveBeenCalledOnce()
  })

  it('renseigner puis arrêter : le choix des jours se ferme, et la feuille avec', async () => {
    stop.mockRejectedValue(new DoseAlreadyLoggedError())
    const settled = vi.fn<() => void>()
    const result = flow({ settled, stopFailure: 'message' })

    result.onStopAction('choose-days')
    result.confirmChosenDays({ given: result.stopping.value!.dues, missed: [] })
    await flushPromises()

    expect(result.isChooseDaysOpen.value).toBe(false)
    expect(result.stopError.value).toBeNull()
    expect(settled).toHaveBeenCalledOnce()
  })
})
