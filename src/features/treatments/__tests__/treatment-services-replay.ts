import { vi } from 'vitest'

import type { V2Step, V2Walk } from '../../../../scripts/dose-engine/v2-walk'
import {
  newSettings,
  treatmentView,
  type Gesture,
  type Line,
  type Setting,
  type TreatmentView,
} from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import type { DoseAction } from '../logic/treatment-dose-change'
import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '../repository/treatment-periods.repository'
import { createTreatmentsRepository } from '../repository/treatments.repository'
import { createTreatmentDosesService } from '../service/treatment-doses.service'
import { createTreatmentPlanService } from '../service/treatment-plan.service'
import { createTreatmentStopService } from '../service/treatment-stop.service'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'

const ANIMAL = '11111111-1111-4111-8111-111111111111'
const BASE = Date.UTC(2027, 0, 1)

export type Replay = Awaited<ReturnType<typeof createReplay>>

/** Les services des traitements sur une base SQLite en mémoire, horloge et jour menés par le test. */
type Db = Parameters<typeof createTreatmentsRepository>[0]

/**
 * `followsDay` : l'horloge suit le jour mené, comme sur le téléphone ; sinon elle part du 1er janvier
 * 2027, plus récente que toute écriture d'un autre appareil posée par le test.
 */
export async function createReplay(db: Db, { followsDay = false } = {}) {
  await db.execute('PRAGMA foreign_keys = ON')
  await db.run(
    `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
     VALUES (?, 'Milo', 'dog', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'test', 'test')`,
    [ANIMAL],
  )
  const clock = { day: '2026-01-01', seconds: 0, secondsOf: '' }
  const treatments = createTreatmentsRepository(db)
  const reminders = { reschedule: async () => {} }
  const doses = createTreatmentDosesService({
    treatments: () => treatments,
    doses: () => createTreatmentDosesRepository(db),
    reminders,
    now: () => new Date(),
    today: () => clock.day,
  })
  const plans = createTreatmentPlanService({
    treatments: () => treatments,
    reminders,
    today: () => clock.day,
    newId: () => crypto.randomUUID(),
  })
  const stops = createTreatmentStopService({
    treatments: () => treatments,
    periods: () => createTreatmentPeriodsRepository(db),
    doses: () => createTreatmentDosesRepository(db),
    reminders,
    today: () => clock.day,
    now: () => new Date(),
    newId: () => crypto.randomUUID(),
  })
  return {
    db,
    clock,
    doses,
    plans,
    stops,
    treatments,
    /** Chaque écriture a son horodatage : jamais deux dans la même milliseconde. */
    tick(): void {
      if (!followsDay) {
        clock.seconds += 1
        vi.setSystemTime(BASE + clock.seconds * 1000)
        return
      }
      if (clock.secondsOf !== clock.day) Object.assign(clock, { seconds: 0, secondsOf: clock.day })
      clock.seconds += 1
      const [year, month, day] = clock.day.split('-').map(Number) as [number, number, number]
      vi.setSystemTime(new Date(year, month - 1, day, 1, 0, clock.seconds))
    },
    async start(walk: V2Walk, id: string): Promise<TreatmentWithHistory> {
      const [setting] = walk.input.settings as [Setting]
      if (followsDay) clock.day = walk.input.today
      this.tick()
      await treatments.create({
        id,
        animalId: ANIMAL,
        name: 'Test',
        type: 'medication',
        settings: {
          startsOn: setting.startsOn,
          firstDueOn: setting.firstDueOn,
          endsOn: setting.endsOn,
          frequency: setting.frequency,
          times: [...setting.times],
          doseQuantity: null,
          doseUnit: null,
          reminderOffsetMinutes: null,
          reminderTime: null,
        },
      })
      clock.day = walk.input.today
      return history(treatments, id)
    },
  }
}

async function history(
  treatments: Awaited<ReturnType<typeof createReplay>>['treatments'],
  id: string,
): Promise<TreatmentWithHistory> {
  const found = await treatments.getWithHistory(id)
  if (found === null) throw new Error(`Traitement introuvable : ${id}`)
  return found
}

const dayKey = (due: { dueOn: string; dueTime: string | null }) =>
  `${due.dueOn} ${due.dueTime ?? ''}`

/** Ce que les écrans lisent : de quoi comparer deux lectures sans leurs identifiants. */
export function signatureOf(view: TreatmentView): string[] {
  const lines = view.history.map(
    ({ line, effect }) =>
      `${line.status} ${dayKey(line)} ${line.givenOn ?? ''} ${line.targetOn ?? ''} ${effect.kind}`,
  )
  return [
    view.phase,
    String(view.finished),
    view.currentDoses.map(dayKey).join(),
    view.unloggedDoses.map(dayKey).join(),
    view.upcoming({ limit: 12 }).map(dayKey).join(),
    ...lines.sort(),
  ]
}

export async function readingAfter(replay: Replay, id: string): Promise<string[] | null> {
  const reading = readTreatment(await history(replay.treatments, id), replay.clock.day)
  return reading === null ? null : signatureOf(reading.view)
}

export const expectedSignature = (step: V2Step): string[] => signatureOf(treatmentView(step.after))

// Le identifiant d'une ligne du carnet de la marche, retrouvé par son contenu dans la base.
function dbLineId(lines: TreatmentWithHistory['doses'], line: Line, periodId: string): string {
  const found = lines
    .filter(
      (dose) =>
        dose.periodId === periodId &&
        dose.dueOn === line.dueOn &&
        dose.dueTime === line.dueTime &&
        dose.status === line.status,
    )
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))
    .at(-1)
  if (found === undefined) throw new Error(`Ligne absente de la base : ${JSON.stringify(line)}`)
  return found.id
}

/** Le geste de la marche, tel que l'écran l'enverrait au service. */
export function actionOf(
  gesture: Gesture,
  before: V2Step['before'],
  stored: TreatmentWithHistory,
  periodOf: (settingId: string) => string,
): DoseAction {
  switch (gesture.kind) {
    case 'note':
      return {
        kind: 'note',
        gesture: {
          ...gesture,
          due: { ...gesture.due, settingId: periodOf(gesture.due.settingId) },
        },
      }
    case 'move':
      return {
        kind: 'move',
        due: { ...gesture.due, settingId: periodOf(gesture.due.settingId) },
        to: gesture.to,
        shiftsFollowing: gesture.shiftsFollowing,
      }
    case 'redate':
    case 'remove': {
      const line = before.lines.find(({ id }) => id === gesture.lineId)!
      const lineId = dbLineId(stored.doses, line, periodOf(line.settingId))
      return gesture.kind === 'remove'
        ? { kind: 'remove', lineId }
        : {
            kind: 'redate',
            lineId,
            givenOn: gesture.givenOn,
            shiftsFollowing: gesture.shiftsFollowing,
          }
    }
  }
}

export { history as storedHistory, newSettings }
