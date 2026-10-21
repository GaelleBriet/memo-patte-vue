import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import AccountRestoreView from '../views/AccountRestoreView.vue'
import i18n from '@/core/i18n'
import type { RestoreMode } from '@/core/sync/repository/sync-outbox.repository'
import type { RestoreProgress } from '@/core/sync/service/account-restore'
import {
  createRestoreFlow,
  provideRestoreFlow,
  type RestoreFlow,
  type RestoreRunner,
} from '@/core/sync/service/restore-flow'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { plain } from '@/shared/__tests__/plain'

const promptNotificationsIfReminders = vi.hoisted(() =>
  vi.fn<(router: unknown, from: string, options?: { ready?: boolean }) => Promise<boolean>>(
    async () => false,
  ),
)

vi.mock('@/core/notifications/reminders-priming', () => ({ promptNotificationsIfReminders }))
vi.mock('@/core/app-lifecycle/app-resume', () => ({
  useAppResume: () => {},
  onAppResume: () => () => {},
}))

type FakeRunner = RestoreRunner & {
  emit(progress: RestoreProgress): void
  finish(): void
  fail(): void
}

function fakeRunner(): FakeRunner {
  let pending: RestoreMode | null = null
  let settle: { resolve: () => void; reject: (cause: Error) => void } | null = null
  const listeners = new Set<(progress: RestoreProgress) => void>()
  return {
    pendingMode: vi.fn<RestoreRunner['pendingMode']>(async () => pending),
    start: vi.fn<RestoreRunner['start']>(async (mode: RestoreMode) => {
      pending = mode
    }),
    run: vi.fn<RestoreRunner['run']>(
      () =>
        new Promise<void>((resolve, reject) => {
          settle = { resolve, reject }
        }),
    ),
    progress: { done: 0, total: 0 },
    onProgress(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    emit(progress) {
      for (const listener of listeners) listener(progress)
    },
    finish() {
      settle?.resolve()
    },
    fail() {
      settle?.reject(new Error('réseau coupé'))
    },
  }
}

const SUMMARY = { animalCount: 3, lastBackupAt: new Date(2026, 9, 20, 21, 4).toISOString() }

let runner: FakeRunner
let flow: RestoreFlow
let replace: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 9, 21, 10, 0) })
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 411,
    height: 815,
    offsetTop: 0,
  })
  setActivePinia(createPinia())
  runner = fakeRunner()
  flow = createRestoreFlow(runner)
  provideRestoreFlow(flow)
  flow.offer(SUMMARY)
  await router.push({ name: 'account-restore', query: { from: 'settings-plus' } })
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  provideRestoreFlow(null)
  document.body.innerHTML = ''
  i18n.global.locale.value = 'fr'
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(AccountRestoreView, {
    global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function texte(selecteur: string): string | undefined {
  const element = document.querySelector(selecteur)
  if (!element) return undefined
  const lignes = element.querySelectorAll('.settings-row__label, .settings-row__hint')
  const parties =
    lignes.length > 0 ? [...lignes].map((ligne) => ligne.textContent) : [element.textContent]
  return plain(parties.join(' ').replace(/\s+/g, ' ').trim())
}

function bouton(libelle: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (element) => element.textContent?.trim() === libelle,
  )
}

function carte(libelle: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find(
    (option) => option.querySelector('.choice-cards__label')?.textContent?.trim() === libelle,
  )
}

async function toucher(element: HTMLElement | undefined): Promise<void> {
  element?.click()
  await flushPromises()
}

describe('Restaurer mon carnet', () => {
  it('montre la sauvegarde trouvée et le choix de l’import, rien de présélectionné', async () => {
    await monter()

    expect(texte('.pushed-screen__title')).toBe('Restaurer mon carnet')
    expect(texte('.account-restore__found')).toBe(
      'Sauvegarde trouvée 3 animaux · dernière sauvegarde hier à 21 h 04',
    )
    expect(texte('.account-restore__existing')).toBe('Des données existent déjà sur ce téléphone.')
    const options = [...document.querySelectorAll<HTMLElement>('[role="radio"]')]
    expect(
      options.map((option) => option.querySelector('.choice-cards__label')?.textContent),
    ).toEqual(['Fusionner', 'Remplacer'])
    expect(options.some((option) => option.getAttribute('aria-checked') === 'true')).toBe(false)
    expect(
      document.querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby'),
    ).toBeTruthy()
    expect(bouton('Continuer')?.disabled).toBe(true)
  })

  it('« Fusionner » part sans confirmation, l’écran reste affiché avec la progression, puis l’accueil', async () => {
    await monter()

    await toucher(carte('Fusionner'))
    await toucher(bouton('Continuer'))

    expect(runner.start).toHaveBeenCalledWith('merge')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(texte('.account-restore__progress')).toBe('Restauration de ton carnet')
    expect(document.querySelector('.pushed-screen__back--hidden')).not.toBeNull()

    runner.emit({ done: 120, total: 348 })
    await flushPromises()
    expect(texte('.account-restore__progress')).toBe(
      'Restauration de ton carnet 120 éléments sur 348',
    )
    expect(texte('.pushed-screen__title')).toBe('Restaurer mon carnet')

    runner.finish()
    await flushPromises()
    expect(replace).toHaveBeenCalledWith({ name: 'home' })
    expect(promptNotificationsIfReminders).toHaveBeenCalledWith(router, 'home', { ready: true })
  })

  it('« Remplacer » demande confirmation, et ne lance rien si on annule', async () => {
    await monter()
    await toucher(carte('Remplacer'))

    await toucher(bouton('Continuer'))

    expect(texte('.confirm-dialog')).toContain('Remplacer toutes tes données ?')
    expect(texte('.confirm-dialog')).toContain(
      'Les données actuelles de ce téléphone seront remplacées par celles de la sauvegarde.',
    )
    await toucher(bouton('Annuler'))
    expect(runner.start).not.toHaveBeenCalled()

    await toucher(bouton('Continuer'))
    await toucher(bouton('Remplacer'))
    expect(runner.start).toHaveBeenCalledWith('replace')
    expect(texte('.account-restore__progress')).toBe('Restauration de ton carnet')
  })

  it('réseau coupé : rien n’est perdu, « Plus tard » ramène à l’accueil', async () => {
    await monter()
    await toucher(carte('Fusionner'))
    await toucher(bouton('Continuer'))

    runner.fail()
    await flushPromises()

    expect(texte('.account-restore__offline')).toBe(
      'La restauration reprendra dès le retour du réseau. Rien n’est perdu.',
    )
    await toucher(bouton('Plus tard'))
    expect(replace).toHaveBeenCalledWith({ name: 'home' })
  })

  it('reprend seule au retour du réseau, l’écran resté ouvert', async () => {
    await monter()
    await toucher(carte('Fusionner'))
    await toucher(bouton('Continuer'))
    runner.fail()
    await flushPromises()

    void flow.resume()
    await flushPromises()
    expect(texte('.account-restore__progress')).toBe('Restauration de ton carnet')
    runner.finish()
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({ name: 'home' })
  })

  it('la flèche de retour ramène à l’écran d’origine sans rien lancer', async () => {
    await monter()

    await toucher(document.querySelector<HTMLElement>('.pushed-screen__back') ?? undefined)

    expect(replace).toHaveBeenCalledWith({ name: 'settings-plus' })
    expect(runner.start).not.toHaveBeenCalled()
  })

  it('sans sauvegarde à proposer, ramène à l’écran d’origine', async () => {
    flow.reset()

    await monter()

    expect(replace).toHaveBeenCalledWith({ name: 'settings-plus' })
  })

  it('en anglais', async () => {
    i18n.global.locale.value = 'en'
    await monter()

    expect(texte('.pushed-screen__title')).toBe('Restore my health record')
    expect(texte('.account-restore__found')).toBe(
      'Backup found 3 pets · last backup yesterday at 9:04 pm',
    )
    expect(texte('.account-restore__existing')).toBe('Data already exists on this phone.')

    await toucher(carte('Replace'))
    await toucher(bouton('Continue'))
    expect(texte('.confirm-dialog')).toContain(
      'The current data on this phone will be replaced with your backup.',
    )
    await toucher(bouton('Replace'))
    runner.emit({ done: 120, total: 348 })
    await flushPromises()
    expect(texte('.account-restore__progress')).toBe(
      'Restoring your health record 120 of 348 items',
    )

    runner.fail()
    await flushPromises()
    expect(texte('.account-restore__offline')).toBe(
      'Restoring will resume when you’re back online. Nothing is lost.',
    )
    expect(bouton('Not now')).toBeDefined()
  })
})
