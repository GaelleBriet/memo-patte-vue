import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ManageSubscriptionSection from '../ManageSubscriptionSection.vue'
import { NO_PLUS, type PlusStatus } from '../plus-status'
import { writeStoredPlusStatus } from '../plus-status-storage'
import { memoryStorage } from './billing-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'

const ANNUAL: PlusStatus = { plan: 'annual', expiresAt: '2027-09-14T10:00:00Z' }
const MONTHLY: PlusStatus = { plan: 'monthly', expiresAt: '2026-10-14T10:00:00Z' }
const LIFETIME: PlusStatus = { plan: 'lifetime', expiresAt: null }
const EXPIRED: PlusStatus = { plan: 'annual', expiresAt: '2026-09-01T10:00:00Z' }

let wrapper: VueWrapper | null = null

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-16T10:00:00Z') })
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function monter() {
  wrapper = mount(ManageSubscriptionSection, { global: { plugins: [vuetify, i18n] } })
  return wrapper
}

describe('ManageSubscriptionSection', () => {
  it.each([
    ['un abonnement annuel', ANNUAL],
    ['un abonnement mensuel', MONTHLY],
  ])('renvoie vers Google Play pour %s', (_, status) => {
    writeStoredPlusStatus(status)
    const lien = monter().get('a.settings-row--manage-subscription')

    expect(lien.text()).toContain('Gérer mon abonnement · Google Play')
    expect(lien.attributes('href')).toBe('https://play.google.com/store/account/subscriptions')
    expect(lien.attributes('target')).toBe('_blank')
    expect(lien.attributes('rel')).toContain('noopener')
  })

  it.each([
    ['un utilisateur gratuit', NO_PLUS],
    ['un achat à vie, qui ne se résilie pas', LIFETIME],
    ['un abonnement déjà expiré', EXPIRED],
  ])('ne propose rien à %s', (_, status) => {
    writeStoredPlusStatus(status)

    expect(monter().find('a').exists()).toBe(false)
  })
})
