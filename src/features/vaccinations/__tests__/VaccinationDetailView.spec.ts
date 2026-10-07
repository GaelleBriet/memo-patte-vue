import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest'

import { fakeVaccinationsRepository } from './fake-vaccinations-repository'
import VaccinationDetailView from '../views/VaccinationDetailView.vue'
import VaccinationPastInjectionSheet from '../views/VaccinationPastInjectionSheet.vue'
import VaccinationReminderSheet from '../views/VaccinationReminderSheet.vue'
import { VaccinationWithoutReminderError } from '../logic/vaccination-history'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import type { Vaccination } from '../schema/vaccination.schema'
import type { VaccinationInjectionsService } from '../service/vaccination-injections.service'
import {
  provideVaccinationInjectionsService,
  provideVaccinationRemindersService,
  provideVaccinationsRepository,
} from '../store/vaccinations.store'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import router from '@/router'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import DatePickerSheet from '@/shared/components/DatePickerSheet.vue'
import HistoryRow from '@/shared/components/HistoryRow.vue'
import NextDueCard from '@/shared/components/NextDueCard.vue'
import OverflowMenu from '@/shared/components/OverflowMenu.vue'
import { dismissToast, runToastAction, toastAction, toastMessage } from '@/shared/utils/toast'
import { plain } from '@/shared/__tests__/plain'

const TODAY = new Date('2026-09-23T10:00:00')

const BOREE: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Boree',
  species: 'dog',
  breed: 'Bouvier bernois',
  birthDate: '2026-04-10',
  birthDateApproximate: false,
  photoPath: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
  unfollowedOn: null,
  departureReason: null,
  departureDate: null,
}

const STAMPS = {
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

const CARRE: Vaccination = {
  id: '55555555-5555-4555-8555-555555555555',
  animalId: BOREE.id,
  name: 'Carré',
  lastInjectionDate: '2026-08-26',
  dueDate: '2027-08-26',
  ...STAMPS,
}

function injection(id: string, injectedOn: string, nextDueDate: string | null) {
  return {
    id,
    vaccinationId: CARRE.id,
    animalId: BOREE.id,
    injectedOn,
    nextDueDate,
    ...STAMPS,
  } satisfies VaccinationInjection
}

const INJECTIONS = [
  injection('i3', '2026-08-26', '2027-08-26'),
  injection('i2', '2026-07-27', '2026-08-26'),
  injection('i1', '2026-06-28', '2026-07-27'),
]

let injections: VaccinationInjection[]
let getById: MockInstance
let remove: MockInstance
let restore: MockInstance
let service: {
  [
    K in
      | 'record'
      | 'addPast'
      | 'addPastWithReminder'
      | 'undo'
      | 'remove'
      | 'undoRemove'
      | 'changeDate'
      | 'changeDateAndReminder'
      | 'undoChangeDate'
  ]: Mock<VaccinationInjectionsService[K]>
}
let push: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.useFakeTimers({ now: TODAY, toFake: ['Date'] })
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
  setActivePinia(createPinia())
  const animals = useAnimalsStore()
  animals.animals = [BOREE]
  animals.hasLoaded = true
  injections = INJECTIONS
  const repository = fakeVaccinationsRepository({
    getById: async (id) => (id === CARRE.id ? CARRE : null),
    listInjections: async () => injections,
    remove: async () => '2026-09-23T08:00:00.000Z',
    restore: async () => {},
  })
  getById = repository.getById
  remove = repository.remove
  restore = repository.restore
  provideVaccinationsRepository(() => repository)
  provideVaccinationRemindersService(() => ({
    reschedule: vi.fn<(id: string) => Promise<void>>(async () => {}),
  }))
  service = {
    record: vi.fn<VaccinationInjectionsService['record']>(),
    addPast: vi.fn<VaccinationInjectionsService['addPast']>(async () => ({
      animalId: BOREE.id,
      injectionId: 'i0',
    })),
    addPastWithReminder: vi.fn<VaccinationInjectionsService['addPastWithReminder']>(async () => ({
      animalId: BOREE.id,
      injectionId: 'i4',
    })),
    undo: vi.fn<VaccinationInjectionsService['undo']>(async () => {}),
    remove: vi.fn<VaccinationInjectionsService['remove']>(async () => ({ plannedSet: false })),
    undoRemove: vi.fn<VaccinationInjectionsService['undoRemove']>(async () => {}),
    changeDate: vi.fn<VaccinationInjectionsService['changeDate']>(async () => ({
      injectedOn: '2026-07-27',
      nextDueDate: '2026-08-26',
    })),
    changeDateAndReminder: vi.fn<VaccinationInjectionsService['changeDateAndReminder']>(
      async () => ({ injectedOn: '2026-07-27', nextDueDate: '2026-08-26' }),
    ),
    undoChangeDate: vi.fn<VaccinationInjectionsService['undoChangeDate']>(async () => {}),
  }
  provideVaccinationInjectionsService(() => service)
  await router.push({ name: 'animals' })
  await router.push({ name: 'vaccination-detail', params: { id: CARRE.id } })
  push = vi.spyOn(router, 'push').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  dismissToast()
  document.body.innerHTML = ''
  provideVaccinationsRepository(null)
  provideVaccinationRemindersService(null)
  provideVaccinationInjectionsService(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function monter(id = CARRE.id) {
  wrapper = mount(VaccinationDetailView, {
    props: { id },
    global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function lignes(view: VueWrapper) {
  return view.findAllComponents(HistoryRow)
}

async function choisir(view: VueWrapper, index: number, action: string) {
  lignes(view)[index]!.vm.$emit('select', action)
  await flushPromises()
}

function feuilleDuRappel(view: VueWrapper) {
  const found = view
    .findAllComponents(VaccinationReminderSheet)
    .find((sheet) => sheet.props('redate'))
  if (!found) throw new Error('Pas de feuille de rappel pour une injection redatée')
  return found
}

function dialogue(view: VueWrapper) {
  return view.getComponent(ConfirmDialog)
}

describe('VaccinationDetailView — F7', () => {
  it('présente le vaccin, sa dernière injection, son prochain rappel « À jour » et ses injections (V12)', async () => {
    const view = await monter()

    expect(view.get('.pushed-screen__title').text()).toBe('Carré')
    expect(view.get('.pushed-screen__subtitle').text()).toBe('Vaccin · Boree')
    expect(plain(view.getComponent(NextDueCard).props())).toMatchObject({
      label: 'Prochain rappel',
      value: '26 août 2027',
      delay: 'À jour',
      tone: null,
    })
    expect(plain(view.get('.next-due-card__top').text())).toBe('Dernière injection · 26 août 2026')
    expect(view.get('.section-card__title').text()).toBe('Injections')
    expect(view.get('.section-card__counter').text()).toBe('3')
    expect(
      lignes(view).map((row) =>
        plain([row.props('date'), row.props('badge'), row.props('detail')]),
      ),
    ).toEqual([
      ['26 août 2026', 'Dernière injection', 'Rappel prévu le 26 août 2027'],
      ['27 juil. 2026', null, 'Rappel prévu le 26 août 2026'],
      ['28 juin 2026', null, 'Rappel prévu le 27 juil. 2026'],
    ])
    expect(plain(lignes(view)[1]!.props('optionsLabel'))).toBe(
      'Options pour l’injection du 27 juillet 2026',
    )
    expect(
      lignes(view)[0]!
        .props('items')
        .map(({ label }) => label),
    ).toEqual(['Changer la date', 'Supprimer cette injection'])
  })

  it('« C’est fait » ouvre la feuille « Fait » du vaccin (F5)', async () => {
    const view = await monter()

    view.getComponent(NextDueCard).vm.$emit('done')
    await flushPromises()

    expect(view.getComponent(VaccinationReminderSheet).props()).toMatchObject({
      modelValue: true,
      vaccinationId: CARRE.id,
      startAt: 'done',
    })
  })

  it('« Fait à une autre date » ouvre la feuille « Fait » sur le calendrier de l’injection (VA-5)', async () => {
    const view = await monter()

    view.getComponent(NextDueCard).vm.$emit('otherDate')
    await flushPromises()

    expect(view.getComponent(VaccinationReminderSheet).props()).toMatchObject({
      modelValue: true,
      vaccinationId: CARRE.id,
      startAt: 'other-date',
    })
    expect(view.getComponent(NextDueCard).props('otherDateAriaLabel')).toBe(
      'Fait à une autre date\u00a0: choisir la date de l’injection',
    )
  })

  it('le crayon de la barre ouvre le formulaire, qui reviendra sur le détail (V11 quinquies)', async () => {
    const view = await monter()

    expect(view.get('.vaccination-detail__edit').attributes('aria-label')).toBe(
      'Modifier le vaccin Carré',
    )
    await view.get('.vaccination-detail__edit').trigger('click')

    expect(push).toHaveBeenCalledWith({
      name: 'vaccination-edit',
      params: { id: CARRE.id },
      query: { from: 'vaccination-detail', reminder: `vaccination:${CARRE.id}` },
    })
  })

  it('dit « Pas de rappel programmé » quand le dernier choix était « Pas de rappel »', async () => {
    getById.mockResolvedValue({ ...CARRE, dueDate: null })
    const view = await monter()

    expect(view.getComponent(NextDueCard).props()).toMatchObject({
      value: null,
      emptyText: 'Pas de rappel programmé',
    })
  })

  it('dit « Aujourd’hui » le jour du rappel, puis depuis quand il est en retard (VA-17)', async () => {
    getById.mockResolvedValue({ ...CARRE, dueDate: '2026-09-23' })
    const jour = await monter()
    expect(jour.getComponent(NextDueCard).props()).toMatchObject({
      label: 'Prochain rappel',
      value: 'Aujourd’hui',
      tone: 'today',
    })
    jour.unmount()

    getById.mockResolvedValue({ ...CARRE, dueDate: '2026-09-05' })
    const retard = await monter()
    expect(plain(retard.getComponent(NextDueCard).props())).toMatchObject({
      label: 'Prochain rappel',
      value: 'En retard depuis le 5 sept.',
      tone: 'overdue',
    })
    expect(retard.text()).not.toContain('en retard de')
  })

  it('présente un vaccin prévu sous « Prochain rappel », avec « Premier vaccin » (V11 quinquies)', async () => {
    getById.mockResolvedValue({ ...CARRE, lastInjectionDate: null, dueDate: '2026-09-22' })
    injections = []
    const view = await monter()

    expect(view.get('.next-due-card__label').text()).toBe('Prochain rappel')
    expect(view.get('.next-due-card__top').text()).toBe('Premier vaccin · aucune injection notée')
    expect(plain(view.get('.next-due-card__value').text())).toBe('En retard depuis le 22 sept.')
    expect(view.find('.vaccination-detail__edit').exists()).toBe(true)
    expect(view.findComponent(OverflowMenu).exists()).toBe(true)
    expect(view.find('.section-card').exists()).toBe(false)
    expect(view.get('.vaccination-detail__add-past').text()).toBe('Ajouter une injection passée')
  })

  it('le jour du rendez-vous, « Premier vaccin » en haut et « Aucune injection notée » sous la valeur (V11 ter)', async () => {
    getById.mockResolvedValue({ ...CARRE, lastInjectionDate: null, dueDate: '2026-09-23' })
    injections = []
    const view = await monter()

    expect(view.get('.next-due-card__top').text()).toBe('Premier vaccin')
    expect(view.get('.next-due-card__value').text()).toBe('Aujourd’hui')
    expect(view.get('.next-due-card__note').text()).toBe('Aucune injection notée')
  })

  it('dit quand le vaccin est introuvable', async () => {
    const view = await monter('99999999-9999-4999-8999-999999999999')

    expect(view.get('[role="alert"]').text()).toBe('Ce vaccin est introuvable.')
  })
})

describe('VaccinationDetailView — animal qu’on ne suit plus (Q6 de #579)', () => {
  it('ne montre aucun statut, seulement la dernière injection et l’historique', async () => {
    useAnimalsStore().animals = [{ ...BOREE, unfollowedOn: '2026-09-20' }]

    const view = await monter()

    expect(plain(view.get('.next-due-card__top').text())).toBe('Dernière injection · 26 août 2026')
    expect(view.find('.next-due-card__label').exists()).toBe(false)
    expect(view.find('.next-due-card__value').exists()).toBe(false)
    expect(view.find('.next-due-card__empty').exists()).toBe(false)
    expect(lignes(view)).toHaveLength(3)
  })
})

describe('VaccinationDetailView — injection supprimée ou redatée', () => {
  it('supprime une injection sans dialogue, toast avec « Annuler » qui la rétablit', async () => {
    const view = await monter()

    await choisir(view, 1, 'remove')

    expect(service.remove).toHaveBeenCalledWith(CARRE.id, 'i2')
    expect(view.findComponent(ConfirmDialog).props('modelValue')).toBe(false)
    expect(plain(toastMessage.value)).toBe('Injection du 27 juil. supprimée')
    expect(plain(toastAction.value?.ariaLabel)).toBe(
      'Annuler la suppression de l’injection du 27 juillet 2026',
    )

    runToastAction()
    await flushPromises()
    expect(service.undoRemove).toHaveBeenCalledWith(CARRE.id, 'i2', { plannedSet: false })
  })

  it('change la date d’une injection par le calendrier, dans ses bornes, et l’annule', async () => {
    const view = await monter()

    await choisir(view, 1, 'changeDate')
    const calendrier = view.getComponent(DatePickerSheet)
    expect(plain(calendrier.props())).toMatchObject({
      modelValue: true,
      title: 'Changer la date',
      subtitle: 'Injection du 27 juil. 2026',
      date: '2026-07-27',
      min: '2026-04-10',
      max: '2026-09-23',
      excluded: ['2026-08-26', '2026-06-28'],
    })

    calendrier.vm.$emit('pick', '2026-07-25')
    await flushPromises()

    expect(service.changeDate).toHaveBeenCalledWith(CARRE.id, 'i2', '2026-07-25')
    expect(feuilleDuRappel(view).props('modelValue')).toBe(false)
    expect(plain(toastMessage.value)).toBe('Injection déplacée au 25 juil.')
    runToastAction()
    await flushPromises()
    expect(service.undoChangeDate).toHaveBeenCalledWith(CARRE.id, 'i2', {
      injectedOn: '2026-07-27',
      nextDueDate: '2026-08-26',
    })
  })

  it('redemande le rappel d’une injection déplacée après son « autre date », puis écrit tout d’un coup', async () => {
    const view = await monter()
    await choisir(view, 1, 'changeDate')

    view.getComponent(DatePickerSheet).vm.$emit('pick', '2026-09-01')
    await flushPromises()

    expect(service.changeDate).not.toHaveBeenCalled()
    expect(feuilleDuRappel(view).props()).toMatchObject({
      modelValue: true,
      vaccinationId: CARRE.id,
      startAt: 'done',
      initialInjectedOn: '2026-09-01',
    })

    const dates = { injectedOn: '2026-09-01', nextDueDate: '2027-09-01' }
    feuilleDuRappel(view).vm.$emit('reminderChosen', dates)
    await flushPromises()

    expect(service.changeDateAndReminder).toHaveBeenCalledExactlyOnceWith(CARRE.id, 'i2', dates)
    expect(service.changeDate).not.toHaveBeenCalled()
    expect(plain(toastMessage.value)).toBe('Injection déplacée au 1er sept.')
    runToastAction()
    await flushPromises()
    expect(service.undoChangeDate).toHaveBeenCalledWith(CARRE.id, 'i2', {
      injectedOn: '2026-07-27',
      nextDueDate: '2026-08-26',
    })
  })

  it('n’écrit rien quand on ferme la question du rappel sans choisir', async () => {
    const view = await monter()
    await choisir(view, 1, 'changeDate')
    view.getComponent(DatePickerSheet).vm.$emit('pick', '2026-09-01')
    await flushPromises()

    feuilleDuRappel(view).vm.$emit('update:modelValue', false)
    await flushPromises()

    expect(service.changeDate).not.toHaveBeenCalled()
    expect(service.changeDateAndReminder).not.toHaveBeenCalled()
    expect(plain(toastMessage.value)).toBeNull()
  })

  it('dit l’échec d’une suppression', async () => {
    service.remove.mockRejectedValue(new Error('base verrouillée'))
    const view = await monter()

    await choisir(view, 1, 'remove')

    expect(plain(toastMessage.value)).toBe('La modification n’a pas abouti. Réessaie.')
  })
})

describe('VaccinationDetailView — suppression du vaccin', () => {
  it('supprime la seule injection qui laisse un rappel : le vaccin reste, toast « Annuler » (VA-14)', async () => {
    injections = [injection('i3', '2026-08-26', '2027-08-26')]
    service.remove.mockResolvedValue({ plannedSet: true })
    const view = await monter()

    await choisir(view, 0, 'remove')

    expect(service.remove).toHaveBeenCalledWith(CARRE.id, 'i3')
    expect(dialogue(view).props('modelValue')).toBe(false)
    expect(plain(toastMessage.value)).toBe('Injection du 26 août supprimée')
    runToastAction()
    await flushPromises()
    expect(service.undoRemove).toHaveBeenCalledWith(CARRE.id, 'i3', { plannedSet: true })
  })

  it('propose de supprimer le vaccin quand sa seule injection ne laisse aucun rappel (VA-14)', async () => {
    injections = [injection('i3', '2026-08-26', null)]
    service.remove.mockRejectedValue(new VaccinationWithoutReminderError(CARRE.id))
    const view = await monter()

    await choisir(view, 0, 'remove')

    expect(toastMessage.value).toBeNull()
    expect(dialogue(view).props()).toMatchObject({
      modelValue: true,
      title: 'Supprimer Carré\u00a0?',
      text: 'C’est sa seule injection, sans rappel prévu\u00a0: le vaccin Carré sera supprimé du carnet.',
      cancelLabel: 'Annuler',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    })
  })

  it('supprime le vaccin depuis le menu du détail, après confirmation, et revient au Carnet', async () => {
    const back = vi.spyOn(router, 'back').mockImplementation(() => {})
    const view = await monter()

    view.findAllComponents(OverflowMenu)[0]!.vm.$emit('select', 'remove')
    await flushPromises()
    expect(dialogue(view).props()).toMatchObject({
      modelValue: true,
      title: 'Supprimer Carré ?',
      text: 'Ses injections et ses rappels seront supprimés du carnet.',
    })
    expect(
      view
        .findAllComponents(OverflowMenu)[0]!
        .props('items')
        .map(({ label }) => label),
    ).toEqual(['Supprimer ce vaccin'])

    dialogue(view).vm.$emit('confirm')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith(CARRE.id)
    expect(plain(toastMessage.value)).toBe('Vaccin Carré supprimé')
    expect(plain(toastAction.value?.ariaLabel)).toBe('Annuler la suppression du vaccin Carré')
    expect(back).toHaveBeenCalled()

    runToastAction()
    await flushPromises()
    expect(restore).toHaveBeenCalledWith(CARRE.id, '2026-09-23T08:00:00.000Z')
  })

  it('ne supprime rien quand on annule le dialogue', async () => {
    const view = await monter()

    view.findAllComponents(OverflowMenu)[0]!.vm.$emit('select', 'remove')
    await flushPromises()
    dialogue(view).vm.$emit('cancel')

    expect(remove).not.toHaveBeenCalled()
  })
})

describe('VaccinationDetailView — injection passée (V12 bis)', () => {
  function feuille(view: VueWrapper) {
    return view.getComponent(VaccinationPastInjectionSheet)
  }

  it('« Ajouter une injection passée » ouvre la feuille, bornée à aujourd’hui, jours pris exclus', async () => {
    const view = await monter()

    const lien = view.get('.vaccination-detail__add-past')
    expect(lien.text()).toBe('Ajouter une injection passée')
    await lien.trigger('click')

    expect(feuille(view).props()).toMatchObject({
      modelValue: true,
      name: 'Carré',
      animal: 'Boree',
      today: '2026-09-23',
      taken: ['2026-08-26', '2026-07-27', '2026-06-28'],
    })
  })

  it('ajoute l’injection, ferme la feuille et propose « Annuler » (VA-10)', async () => {
    const view = await monter()
    await view.get('.vaccination-detail__add-past').trigger('click')

    feuille(view).vm.$emit('add', '2022-06-20')
    await flushPromises()

    expect(service.addPast).toHaveBeenCalledWith(CARRE.id, '2022-06-20')
    expect(feuille(view).props('modelValue')).toBe(false)
    expect(plain(toastMessage.value)).toBe('Injection du 20 juin 2022 ajoutée')
    expect(plain(toastAction.value?.ariaLabel)).toBe(
      'Annuler l’ajout de l’injection du 20 juin 2022',
    )

    runToastAction()
    await flushPromises()
    expect(service.undo).toHaveBeenCalledWith(CARRE.id, 'i0')
  })

  it('demande le rappel suivant quand l’injection ajoutée dépasse le rappel en cours, puis écrit tout d’un coup', async () => {
    getById.mockResolvedValue({ ...CARRE, dueDate: '2026-09-05' })
    const view = await monter()
    await view.get('.vaccination-detail__add-past').trigger('click')

    feuille(view).vm.$emit('add', '2026-09-10')
    await flushPromises()

    expect(service.addPast).not.toHaveBeenCalled()
    expect(feuille(view).props('modelValue')).toBe(false)
    expect(feuilleDuRappel(view).props()).toMatchObject({
      modelValue: true,
      vaccinationId: CARRE.id,
      startAt: 'done',
      initialInjectedOn: '2026-09-10',
    })

    const dates = { injectedOn: '2026-09-10', nextDueDate: '2027-09-10' }
    feuilleDuRappel(view).vm.$emit('reminderChosen', dates)
    await flushPromises()

    expect(service.addPastWithReminder).toHaveBeenCalledExactlyOnceWith(CARRE.id, dates)
    expect(service.changeDateAndReminder).not.toHaveBeenCalled()
    expect(plain(toastMessage.value)).toBe('Injection du 10 sept. ajoutée')
    runToastAction()
    await flushPromises()
    expect(service.undo).toHaveBeenCalledWith(CARRE.id, 'i4')
  })

  it('demande aussi le rappel pour une injection ajoutée le jour du rappel en cours', async () => {
    getById.mockResolvedValue({ ...CARRE, dueDate: '2026-09-05' })
    const view = await monter()
    await view.get('.vaccination-detail__add-past').trigger('click')

    feuille(view).vm.$emit('add', '2026-09-05')
    await flushPromises()

    expect(service.addPast).not.toHaveBeenCalled()
    expect(feuilleDuRappel(view).props('initialInjectedOn')).toBe('2026-09-05')
  })

  it('n’ajoute rien quand on ferme la question du rappel sans choisir', async () => {
    getById.mockResolvedValue({ ...CARRE, dueDate: '2026-09-05' })
    const view = await monter()
    await view.get('.vaccination-detail__add-past').trigger('click')
    feuille(view).vm.$emit('add', '2026-09-10')
    await flushPromises()

    feuilleDuRappel(view).vm.$emit('update:modelValue', false)
    await flushPromises()

    expect(service.addPast).not.toHaveBeenCalled()
    expect(service.addPastWithReminder).not.toHaveBeenCalled()
    expect(toastMessage.value).toBeNull()
  })

  it('garde la feuille ouverte et dit l’échec', async () => {
    service.addPast.mockRejectedValue(new Error('base verrouillée'))
    const view = await monter()
    await view.get('.vaccination-detail__add-past').trigger('click')

    feuille(view).vm.$emit('add', '2022-06-20')
    await flushPromises()

    expect(feuille(view).props('modelValue')).toBe(true)
    expect(toastMessage.value).toBe('L’injection n’a pas pu être ajoutée. Réessaie.')
  })
})

describe('VaccinationDetailView — retour', () => {
  it('revient au Carnet sur l’animal du vaccin', async () => {
    const back = vi.spyOn(router, 'back').mockImplementation(() => {})
    const view = await monter()

    await view.get('.pushed-screen__back').trigger('click')

    expect(useAnimalsStore().selectedAnimalId).toBe(BOREE.id)
    expect(back).toHaveBeenCalled()
  })
})
