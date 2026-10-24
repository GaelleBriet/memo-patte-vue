import { vi } from 'vitest'
import { createLocalSyncOutbox } from '@/core/sync/service/local-sync-outbox'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createTreatmentDosesService } from '@/features/treatments/service/treatment-doses.service'
import { createTreatmentPlanService } from '@/features/treatments/service/treatment-plan.service'

const USER_ID = '99999999-9999-4999-8999-999999999999'

/** L'heure réelle, que le faux serveur lit, et que chaque téléphone voit avec son avance. */
export interface RealClock {
  now: number
}

type Db = Parameters<typeof createAnimalsRepository>[0]
type LoadClient = NonNullable<Parameters<typeof createAnimalsRepository>[1]>['loadSupabaseClient']

/** Un téléphone qui synchronise, son horloge en avance de `ahead` millisecondes, son jour mené par le test. */
export async function createClockedPhone<D extends Db>(
  db: D,
  loadSupabaseClient: NonNullable<LoadClient>,
  clock: RealClock,
  ahead: number,
  day: string,
) {
  await db.execute('PRAGMA foreign_keys = ON')
  await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')
  const deps = { loadSupabaseClient }
  const animals = createAnimalsRepository(db, deps)
  const treatments = createTreatmentsRepository(db, deps)
  const periods = createTreatmentPeriodsRepository(db, deps)
  const doseRows = createTreatmentDosesRepository(db, deps)
  const reminders = { reschedule: async () => {} }
  const calendar = { day }
  const today = () => calendar.day
  const cycle = createSyncCycle({
    db,
    outbox: createLocalSyncOutbox(db),
    pushes: createSyncPushRepository(deps.loadSupabaseClient),
    tables: [animals, treatments, periods, doseRows],
    userId: () => USER_ID,
    isEligible: () => true,
  })
  const onClock = <T>(gesture: () => Promise<T>): Promise<T> => {
    vi.setSystemTime(clock.now + ahead)
    return gesture()
  }
  return {
    db,
    calendar,
    animals,
    treatments,
    plans: createTreatmentPlanService({
      treatments: () => treatments,
      reminders,
      today,
      newId: () => crypto.randomUUID(),
    }),
    doses: createTreatmentDosesService({
      treatments: () => treatments,
      doses: () => doseRows,
      reminders,
      now: () => new Date(),
      today,
    }),
    onClock,
    sync: () => onClock(() => cycle.runCycle()),
  }
}

export type ClockedPhone<D extends Db = Db & { close(): void }> = Awaited<
  ReturnType<typeof createClockedPhone<D>>
>
