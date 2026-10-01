import { addDays, format, parseISO } from 'date-fns'

import {
  treatmentSchedule,
  type DoseFields,
  type DoseGesture,
  type Due,
  type TreatmentDoseInput,
  type TreatmentPeriodInput,
  type TreatmentSchedule,
} from '../domain/treatment-schedule'

export type Carnet = { periods: TreatmentPeriodInput[]; doses: TreatmentDoseInput[] }

let stamp = 0

function nextStamp(): string {
  stamp += 1
  return new Date(Date.UTC(2026, 0, 1, 0, 0, stamp)).toISOString()
}

export function period(overrides: Partial<TreatmentPeriodInput> = {}): TreatmentPeriodInput {
  const firstDueOn = overrides.firstDueOn ?? '2026-09-01'
  return {
    id: 'p1',
    startsOn: firstDueOn,
    firstDueOn,
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 1, unit: 'day' },
    times: [],
    createdAt: '2026-08-01T08:00:00.000Z',
    ...overrides,
  }
}

export function weekly(overrides: Partial<TreatmentPeriodInput> = {}): TreatmentPeriodInput {
  return period({ frequency: { value: 1, unit: 'week' }, ...overrides })
}

export function monthly(overrides: Partial<TreatmentPeriodInput> = {}): TreatmentPeriodInput {
  return period({ frequency: { value: 1, unit: 'month' }, ...overrides })
}

export function carnet(...periods: TreatmentPeriodInput[]): Carnet {
  return { periods, doses: [] }
}

export function due(dueOn: string, dueTime: string | null = null, periodId = 'p1'): Due {
  return { periodId, dueOn, dueTime }
}

/** Dates civiles de `from` à `to` inclus. */
export function days(from: string, to: string): string[] {
  const result: string[] = []
  for (let day = parseISO(from); format(day, 'yyyy-MM-dd') <= to; day = addDays(day, 1)) {
    result.push(format(day, 'yyyy-MM-dd'))
  }
  return result
}

export function dueDays(dues: readonly Due[]): string[] {
  return dues.map(({ dueOn }) => dueOn)
}

export function scheduleOf({ periods, doses }: Carnet, today: string): TreatmentSchedule {
  return treatmentSchedule({ periods, doses, today })
}

export function stored(fields: DoseFields, id = `dose-${stamp + 1}`): TreatmentDoseInput {
  const at = nextStamp()
  return { id, ...fields, createdAt: at, updatedAt: at }
}

export type Gesture = DoseGesture | { kind: 'postponed'; due: Due; to: string }

/** Écrit le geste comme le ferait le repository ; un déplacement réécrit sa ligne s'il en a une (Q18). */
export function record(book: Carnet, today: string, gesture: Gesture): Carnet {
  const schedule = scheduleOf(book, today)
  if (gesture.kind !== 'postponed') {
    return { ...book, doses: [...book.doses, stored(schedule.doseFor(gesture))] }
  }
  const moved = schedule.move(gesture.due, gesture.to)
  switch (moved.action) {
    case 'none':
      return book
    case 'create':
      return { ...book, doses: [...book.doses, stored(moved.dose)] }
    case 'delete':
      return { ...book, doses: book.doses.filter(({ id }) => id !== moved.doseId) }
    case 'rewrite':
      return {
        ...book,
        doses: book.doses.map((line) =>
          line.id === moved.doseId ? { ...line, ...moved.dose, updatedAt: nextStamp() } : line,
        ),
      }
  }
}

/** Ligne de déplacement écrite telle quelle, sans passer par le moteur (synchro, fichier importé). */
export function storedMove(book: Carnet, from: string, to: string): Carnet {
  const line = stored({
    periodId: 'p1',
    dueOn: from,
    dueTime: null,
    givenOn: null,
    status: 'postponed',
    nextDueDate: to,
  })
  return { ...book, doses: [...book.doses, line] }
}

/** « C'est fait » sur la dose du moment, la première quand il y en a plusieurs. */
export function done(book: Carnet, today: string, givenOn = today): Carnet {
  const [current] = scheduleOf(book, today).currentDoses
  if (current === undefined) throw new Error(`aucune dose du moment le ${today}`)
  return record(book, today, { kind: 'given', due: current, givenOn })
}

/** « C'est fait » chaque jour, sur la dose du jour. */
export function doneEachDay(book: Carnet, from: string, to: string): Carnet {
  return days(from, to).reduce((result, day) => done(result, day), book)
}

export function lastDose(book: Carnet): TreatmentDoseInput {
  const dose = book.doses.at(-1)
  if (dose === undefined) throw new Error('aucune prise')
  return dose
}

export function withoutDose(book: Carnet, id: string): Carnet {
  return { ...book, doses: book.doses.filter((dose) => dose.id !== id) }
}

/** Corrige une prise comme le ferait le repository : ligne recalculée, déplacements non gardés supprimés. */
export function redate(book: Carnet, today: string, doseId: string, givenOn: string): Carnet {
  const { dose: fields, postponement } = scheduleOf(book, today).redate(doseId, givenOn)
  const dropped = postponement?.kept === false ? postponement.doseIds : []
  const kept = postponement?.kept === true ? postponement : null
  return {
    ...book,
    doses: book.doses
      .filter(({ id }) => !dropped.includes(id))
      .map((dose) => (dose.id === doseId ? { ...dose, ...fields, updatedAt: nextStamp() } : dose))
      .map((dose) =>
        kept?.doseIds.includes(dose.id) ? { ...dose, ...kept.line, updatedAt: nextStamp() } : dose,
      ),
  }
}
