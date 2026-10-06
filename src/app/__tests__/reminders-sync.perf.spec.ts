// @vitest-environment node
import { addDays, format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'

import i18n from '@/core/i18n'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { dose, period, treatment } from '@/features/treatments/__tests__/treatment-fixtures'
import type { TreatmentWithHistory } from '@/features/treatments/repository/treatments.repository'
import { createTreatmentRemindersService } from '@/features/treatments/service/treatment-reminders.service'
import { createFakeNotifications } from '@/shared/__tests__/fake-notifications'
import { MAX_SCHEDULED_REMINDERS } from '@/shared/domain/due-reminders-schedule'
import { createRemindersSync } from '../reminders-sync'

const NOW = new Date(2026, 8, 30, 12)
const STAMP = '2024-10-01T08:00:00.000Z'
const LUNA: Animal = {
  id: 'luna',
  name: 'Luna',
  species: 'cat',
  breed: null,
  birthDate: null,
  photoPath: null,
  createdAt: STAMP,
  updatedAt: STAMP,
  deletedAt: null,
  unfollowedOn: null,
}
const SETTINGS = { vaccineReminderTime: '09:00', remindBeforeDue: true }

/** Quotidien à 8 h et 20 h depuis deux ans, chaque prise notée : le carnet le plus lourd à relire. */
function dailyForTwoYears(id: string): TreatmentWithHistory {
  const doses = []
  for (let day = parseISO('2024-10-01'); day < NOW; day = addDays(day, 1)) {
    const dueOn = format(day, 'yyyy-MM-dd')
    for (const dueTime of ['08:00', '20:00']) {
      doses.push(dose(dueOn, dueOn, { id: `${id} ${dueOn} ${dueTime}`, periodId: id, dueTime }))
    }
  }
  const periods = [
    period({ id, startsOn: '2024-10-01', firstDueOn: '2024-10-01', times: ['08:00', '20:00'] }),
  ]
  return { ...treatment(periods, doses), id }
}

const CARNET = Array.from({ length: 8 }, (_, index) => dailyForTwoYears(`daily-${index}`))

/** Meilleur de trois essais : écarte le bruit de la machine, garde visible une régression. */
async function fastest(run: () => Promise<void>): Promise<number> {
  let best = Infinity
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const start = performance.now()
    await run()
    best = Math.min(best, performance.now() - start)
  }
  return best
}

describe('performance des rappels', () => {
  it('reconstruit 400 rappels depuis huit traitements quotidiens de deux ans en moins de 1 s', async () => {
    const notifications = createFakeNotifications()
    const sync = createRemindersSync({
      animals: () => ({ list: async () => [LUNA] }),
      vaccinations: () => ({ listAll: async () => [] }),
      treatments: () => ({ listAllWithHistory: async () => CARNET }),
      carnetSettings: () => ({ get: async () => SETTINGS }),
      notifications,
      t: i18n.global.t,
      now: () => NOW,
    })

    const elapsed = await fastest(async () => {
      notifications.pending.clear()
      await sync()
    })

    expect(notifications.pending.size).toBe(MAX_SCHEDULED_REMINDERS)
    expect(elapsed).toBeLessThan(1000)
  })

  it('reprogramme un traitement quotidien de deux ans en moins de 200 ms', async () => {
    const notifications = createFakeNotifications()
    const service = createTreatmentRemindersService({
      treatments: () => ({ getWithHistory: async () => CARNET[0]! }),
      animals: () => ({ getById: async () => LUNA }),
      settings: async () => SETTINGS,
      notifications,
      t: i18n.global.t,
      now: () => NOW,
    })

    const elapsed = await fastest(() => service.reschedule(CARNET[0]!.id))

    expect(notifications.pending.size).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(200)
  })
})
