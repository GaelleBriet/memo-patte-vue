import { afterEach, describe, expect, it, vi } from 'vitest'

import { reminderActions } from '@/app/reminder-actions'
import { dismissToast, toastMessage, toastTone } from '@/shared/utils/toast'

vi.mock('@/features/treatments/service/reminder-actions.service', () => ({
  createReminderActions: () => async () => ({
    kind: 'toast',
    tone: 'info',
    message: 'Déjà notée',
  }),
}))

describe('reminderActions', () => {
  afterEach(() => dismissToast())

  it('affiche ce que rend le service', async () => {
    await reminderActions({} as never)({ key: 'k', action: 'done' } as never)

    expect([toastMessage.value, toastTone.value]).toEqual(['Déjà notée', 'info'])
  })
})
