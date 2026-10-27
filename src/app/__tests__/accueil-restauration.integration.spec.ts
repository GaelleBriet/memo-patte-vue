import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'

import { installRestorePrompt } from '@/app/restore-prompt'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { createRestoreFlow } from '@/core/sync/service/restore-flow'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { monthlyFrom } from '@/features/home/__tests__/home-sources'
import { provideHomeRemindersService } from '@/features/home/store/home.store'
import HomeView from '@/features/home/views/HomeView.vue'
import { useTreatmentsStore } from '@/features/treatments/store/treatments.store'
import router from '@/router'
import { isAnySheetOpen } from '@/shared/composables/use-open-sheet'

vi.mock('@/core/notifications/permission', () => ({
  getNotificationPermissionStatus: async () => 'granted',
  hasAndroidAskedNotifications: async () => true,
  openNotificationSettings: async () => {},
}))

vi.mock('@/core/notifications/reminders-priming', () => ({
  promptNotificationsIfReminders: async () => false,
}))

vi.mock('@/shared/utils/auth-available', () => ({ authAvailable: () => false }))

const LUNA: Animal = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Luna',
  species: 'dog',
  breed: null,
  birthDate: null,
  birthDateApproximate: false,
  photoPath: null,
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
  unfollowedOn: null,
  departureReason: null,
  departureDate: null,
}

const VERMIFUGE_LUNA = monthlyFrom('2026-09-09', { id: 't1', animalId: LUNA.id })

let wrapper: ReturnType<typeof mount> | null = null

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date('2026-09-09T12:00:00'), toFake: ['Date'] })
  vi.stubGlobal('visualViewport', { addEventListener() {}, removeEventListener() {} })
  setActivePinia(createPinia())
  const animals = useAnimalsStore()
  vi.spyOn(animals, 'load').mockImplementation(async () => {
    animals.animals = [LUNA]
    animals.hasLoaded = true
    animals.error = null
    return true
  })
  vi.spyOn(useTreatmentsStore(), 'getWithPeriods').mockReturnValue(new Promise(() => {}))
  provideHomeRemindersService(() => ({ listSources: async () => [VERMIFUGE_LUNA] }))
  await router.push({ name: 'home' })
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  provideHomeRemindersService(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

it('notification au lancement : la sauvegarde trouvée avant l’affichage de la feuille n’ouvre pas « Restaurer mon carnet »', async () => {
  await router.replace({
    name: 'home',
    query: { reminder: `treatment:${VERMIFUGE_LUNA.id}`, step: 'actions' },
  })
  const push = vi.spyOn(router, 'push').mockResolvedValue()
  wrapper = mount(HomeView, { global: { plugins: [vuetify, i18n, router] } })
  await flushPromises()
  await vi.waitFor(() => expect(router.currentRoute.value.query).toEqual({}))
  const flow = createRestoreFlow({
    pendingMode: async () => null,
    start: async () => {},
    run: async () => 'restored',
    progress: { done: 0, total: 0 },
    onProgress: () => () => {},
  })
  const uninstall = installRestorePrompt(router, () => flow)

  flow.offer({ animalCount: 1, lastBackupAt: '2026-09-08T19:04:00.000Z' })
  await flushPromises()
  uninstall()

  expect(isAnySheetOpen.value).toBe(true)
  expect(push.mock.calls.map(([to]) => JSON.stringify(to))).not.toContainEqual(
    expect.stringContaining('restore'),
  )
})
