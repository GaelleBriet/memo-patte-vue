import { differenceInCalendarDays } from 'date-fns'

import { latestOf, nextDay, toDate } from '@/shared/domain/calendar-day'
import type {
  ExportData,
  ExportTreatmentDose,
  ExportTreatmentPeriod,
} from '@/shared/domain/carnet-data'
import { play, type Due, type LineChange, type LineFields } from '@/shared/domain/dose-calendar'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { shiftDate } from '@/shared/domain/treatment-frequency'
import { derivedId } from '@/shared/utils/derived-id'
import { groupBy } from '@/shared/utils/group-by'

/** Prise d'un export v1 ou v2 : sa date réelle, et la prochaine dose que l'app annonçait après elle. */
export type LegacyDose = {
  id: string
  treatmentId: string
  animalId: string
  givenOn: string
  nextDueDate: string
  createdAt: string
  updatedAt: string
}

type Replay = {
  period: ExportTreatmentPeriod
  deviceId: string
  today: string
}

const MAX_STEPS_BACK = 12

const byGivenOn = (a: LegacyDose, b: LegacyDose): number =>
  a.givenOn.localeCompare(b.givenOn) ||
  a.createdAt.localeCompare(b.createdAt) ||
  a.id.localeCompare(b.id)

function rowOf(fields: LineFields, id: string, dose: LegacyDose, { deviceId }: Replay) {
  return {
    id,
    periodId: fields.settingId,
    treatmentId: dose.treatmentId,
    animalId: dose.animalId,
    dueOn: fields.dueOn,
    dueTime: fields.dueTime,
    givenOn: fields.givenOn,
    status: fields.status,
    targetOn: fields.targetOn,
    previousTargetOn: fields.previousTargetOn ?? null,
    previousTargetTime: fields.previousTargetTime ?? null,
    dueRank: fields.dueRank ?? null,
    createdAt: dose.createdAt,
    updatedAt: dose.updatedAt,
    createdByDevice: deviceId,
    updatedByDevice: deviceId,
  } satisfies ExportTreatmentDose
}

const shiftIdOf = (dose: LegacyDose) => derivedId(dose.id, 'shift')

// Chaque ancienne prise garde sa ligne : seule la ligne de décalage d'une journée se réécrit.
function withChanges(
  rows: readonly ExportTreatmentDose[],
  changes: readonly LineChange[],
  dose: LegacyDose,
  replay: Replay,
): ExportTreatmentDose[] {
  let next = [...rows]
  for (const change of changes) {
    if (change.action === 'delete') {
      next = next.filter(({ id }) => id !== change.id)
    } else if (change.line.status !== 'shift') {
      next.push(rowOf(change.line, dose.id, dose, replay))
    } else if (change.action === 'rewrite') {
      next = next.map((row) =>
        row.id === change.id
          ? { ...rowOf(change.line, row.id, dose, replay), createdAt: row.createdAt }
          : row,
      )
    } else {
      next.push(rowOf(change.line, shiftIdOf(dose), dose, replay))
    }
  }
  return next
}

function readingOf(rows: readonly ExportTreatmentDose[], { period, today }: Replay) {
  return readTreatment({ periods: [{ ...period, stoppedOn: null }], doses: rows }, today)
}

function firstPending(
  rows: readonly ExportTreatmentDose[],
  replay: Replay,
  from: string,
  until: string,
): Due | null {
  const to = shiftDate(latestOf([from, until])!, replay.period.frequency, 2)
  return readingOf(rows, replay)?.view.upcoming({ from, to, limit: 1 })[0] ?? null
}

function withShift(
  rows: readonly ExportTreatmentDose[],
  due: Due,
  anchor: string,
  dose: LegacyDose,
  replay: Replay,
): ExportTreatmentDose[] {
  const shift: LineFields = {
    settingId: due.settingId,
    dueOn: due.dueOn,
    dueTime: due.dueTime,
    status: 'shift',
    givenOn: null,
    targetOn: anchor,
  }
  return [
    ...rows.filter((row) => row.status !== 'shift' || row.dueOn !== due.dueOn),
    rowOf(shift, shiftIdOf(dose), dose, replay),
  ]
}

function withAnnouncedNext(
  rows: ExportTreatmentDose[],
  due: Due,
  dose: LegacyDose,
  replay: Replay,
): ExportTreatmentDose[] {
  const nextOf = (candidate: readonly ExportTreatmentDose[]) =>
    firstPending(candidate, replay, nextDay(due.dueOn), dose.nextDueDate)?.dueOn
  if (dose.nextDueDate <= due.dueOn || nextOf(rows) === dose.nextDueDate) return rows
  const { frequency } = replay.period
  const anchors = [
    dose.givenOn,
    ...Array.from({ length: MAX_STEPS_BACK }, (_, back) =>
      shiftDate(dose.nextDueDate, frequency, -(back + 1)),
    ),
  ]
  const announced = toDate(dose.nextDueDate)
  const gap = (next: string | undefined) =>
    next === undefined ? Infinity : Math.abs(differenceInCalendarDays(toDate(next), announced))
  let closest = { rows, gap: gap(nextOf(rows)) }
  for (const anchor of anchors) {
    const candidate = withShift(rows, due, anchor, dose, replay)
    const candidateGap = gap(nextOf(candidate))
    if (candidateGap === 0) return candidate
    if (candidateGap < closest.gap) closest = { rows: candidate, gap: candidateGap }
  }
  return closest.rows
}

// En v1 et v2, chaque prise refixait la suite : « C'est fait » est rejoué avec « Décaler aussi les
// doses suivantes », puis un décalage retrouve la prochaine dose que l'app annonçait.
function replayedDoses(doses: readonly LegacyDose[], replay: Replay): ExportTreatmentDose[] | null {
  let rows: ExportTreatmentDose[] = []
  let from = replay.period.firstDueOn
  let announced = from
  let noted: Due | null = null
  for (const dose of doses) {
    const due = firstPending(rows, replay, from, latestOf([dose.givenOn, announced])!)
    const reading = readingOf(rows, replay)
    if (due === null || reading === null) return null
    const result = play(reading.input, {
      kind: 'note',
      due,
      status: 'given',
      givenOn: dose.givenOn,
      shiftsFollowing: true,
    })
    if ('refusal' in result) return null
    rows = withChanges(rows, result.changes, dose, replay)
    if (rows.find(({ id }) => id === dose.id)?.status !== 'extra') noted = due
    if (noted === null) return null
    rows = withAnnouncedNext(rows, noted, dose, replay)
    from = nextDay(noted.dueOn)
    announced = dose.nextDueDate
  }
  return rows
}

/** Les prises de chaque traitement rejouées sur sa période ; `null` si l'une ne se place pas. */
export function withReplayedDoses(
  data: ExportData,
  doses: readonly LegacyDose[],
  deviceId: string,
  today: string,
): ExportData | null {
  const byTreatment = groupBy([...doses].sort(byGivenOn), ({ treatmentId }) => treatmentId)
  const replayed: ExportTreatmentDose[] = []
  for (const period of data.treatmentPeriods) {
    const rows = replayedDoses(byTreatment.get(period.treatmentId) ?? [], {
      period,
      deviceId,
      today,
    })
    if (rows === null) return null
    replayed.push(...rows)
  }
  return { ...data, treatmentDoses: replayed }
}
