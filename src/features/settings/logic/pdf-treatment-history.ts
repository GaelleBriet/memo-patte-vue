import { differenceInCalendarDays, parseISO } from 'date-fns'

import type { ExportFrequency, ExportTreatmentDose } from '@/shared/domain/carnet-data'
import { isAdvanced } from '@/shared/domain/dose-calendar'
import type { Dosage } from '@/shared/domain/dosage'
import type { TreatmentState } from '@/shared/domain/treatment-outlook'
import {
  byStartDescending,
  isSeveralTimesADay,
  periodClosedBeforeFirstDue,
  periodLastDay,
} from '@/shared/domain/treatment-periods'
import { answeredOn } from '@/shared/domain/treatment-not-due-text'
import { countedLines, historyEntries } from '@/shared/domain/treatment-reading'

/** `time` : seulement quand la période a plusieurs heures. */
export type PdfDose = { on: string; time: string | null; extra: boolean }

/**
 * Listées jusqu'à trois, la plus récente d'abord, résumées au-delà ; `time` : l'heure commune à toute
 * la série, quand la période en a plusieurs.
 */
export type PdfDoseSeries =
  | { kind: 'dates'; doses: PdfDose[] }
  | { kind: 'range'; count: number; from: string; to: string; time: string | null }

type PdfLoggedLine =
  | { kind: 'given'; series: PdfDoseSeries }
  | { kind: 'missed'; series: PdfDoseSeries }
  | { kind: 'moved'; dueOn: string; to: string; advanced: boolean }
  | { kind: 'not-due'; dueOn: string; time: string | null; answeredOn: string }

/** `idle` : une ligne sans effet, écrite seule et suivie de « · sans effet » comme sur la fiche (R11). */
export type PdfHistoryLine =
  | PdfLoggedLine
  | { kind: 'unlogged'; from: string; to: string; time: string | null }
  | { kind: 'idle'; line: PdfLoggedLine }

export type PdfTreatmentPeriod = {
  from: string
  /** `null` : période ouverte, sans date de fin. */
  to: string | null
  frequency: ExportFrequency
  /** Vide sauf quand la période a plusieurs heures. */
  times: string[]
  dosage: Dosage
  /** La plus récente d'abord. */
  lines: PdfHistoryLine[]
}

const MAX_LISTED_DOSES = 3
const SERIES_GAP_FACTOR = 1.5
const DAYS_PER_UNIT = { day: 1, week: 7, month: 365.25 / 12 }

function isSameSeries(previous: PdfDose, next: PdfDose, frequency: ExportFrequency): boolean {
  const gap = differenceInCalendarDays(parseISO(next.on), parseISO(previous.on))
  return gap <= SERIES_GAP_FACTOR * frequency.value * DAYS_PER_UNIT[frequency.unit]
}

function commonTime(doses: PdfDose[]): string | null {
  const [first] = doses
  return first && doses.every(({ time }) => time === first.time) ? first.time : null
}

function seriesOf(doses: PdfDose[]): PdfDoseSeries {
  if (doses.length <= MAX_LISTED_DOSES) return { kind: 'dates', doses: [...doses].reverse() }
  return {
    kind: 'range',
    count: doses.length,
    from: doses[0]!.on,
    to: doses.at(-1)!.on,
    time: commonTime(doses),
  }
}

type DoseKind = 'given' | 'missed' | 'unlogged'

type Event =
  | { kind: DoseKind; dose: PdfDose }
  | { kind: 'moved'; time: string | null; line: MovedLine }
  | { kind: 'not-due'; time: string | null; line: NotDueLine }
  | { kind: 'idle'; key: string; line: Extract<PdfHistoryLine, { kind: 'idle' }> }

type MovedLine = Extract<PdfHistoryLine, { kind: 'moved' }>

type NotDueLine = Extract<PdfHistoryLine, { kind: 'not-due' }>

type AloneEvent = Extract<Event, { kind: 'moved' | 'not-due' | 'idle' }>

type ShownDose = Pick<
  ExportTreatmentDose,
  'id' | 'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'targetOn' | 'createdAt'
>

function eventOf(dose: ShownDose, severalTimes: boolean): Event[] {
  const time = severalTimes ? dose.dueTime : null
  switch (dose.status) {
    case 'given':
    case 'extra':
      if (dose.givenOn === null) return []
      return [{ kind: 'given', dose: { on: dose.givenOn, time, extra: dose.status === 'extra' } }]
    case 'missed':
      return [{ kind: 'missed', dose: { on: dose.dueOn, time, extra: false } }]
    case 'postponed':
      return [
        {
          kind: 'moved',
          time,
          line: {
            kind: 'moved',
            dueOn: dose.dueOn,
            to: dose.targetOn ?? dose.dueOn,
            advanced: isAdvanced(dose),
          },
        },
      ]
    case 'not-due':
      return [
        {
          kind: 'not-due',
          time,
          line: { kind: 'not-due', dueOn: dose.dueOn, time, answeredOn: answeredOn(dose) },
        },
      ]
    case 'shift':
      return []
  }
}

function keyOf(event: Event): string {
  if (event.kind === 'idle') return event.key
  return event.kind === 'moved' || event.kind === 'not-due'
    ? `${event.line.dueOn} ${event.time ?? ''}`
    : `${event.dose.on} ${event.dose.time ?? ''}`
}

// R11 : une ligne sans effet ne se regroupe avec aucune autre.
function idleEvents(events: Event[]): Event[] {
  return events.map((event): Event => {
    if (event.kind === 'moved' || event.kind === 'not-due')
      return { kind: 'idle', key: keyOf(event), line: { kind: 'idle', line: event.line } }
    if (event.kind !== 'given' && event.kind !== 'missed') return event
    const series: PdfDoseSeries = { kind: 'dates', doses: [event.dose] }
    return {
      kind: 'idle',
      key: keyOf(event),
      line: { kind: 'idle', line: { kind: event.kind, series } },
    }
  })
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Lue de la plus récente, sur une même échéance : le report ou la réponse « pas à donner », puis la prise, l'oubli, le non renseigné.
const LINE_RANK: Record<Event['kind'], number> = {
  moved: 0,
  'not-due': 0,
  given: 1,
  missed: 2,
  unlogged: 3,
  idle: 4,
}

type DoseRun = { kind: DoseKind; doses: PdfDose[] }

type Run = DoseRun | AloneEvent

function isAlone(run: Run | Event): run is AloneEvent {
  return run.kind === 'moved' || run.kind === 'not-due' || run.kind === 'idle'
}

function lineOf(run: Run): PdfHistoryLine {
  if (isAlone(run)) return run.line
  if (run.kind !== 'unlogged') return { kind: run.kind, series: seriesOf(run.doses) }
  const [first, last] = [run.doses[0]!, run.doses.at(-1)!]
  return { kind: 'unlogged', from: first.on, to: last.on, time: commonTime(run.doses) }
}

function lastKeyOf(run: Run): string {
  return isAlone(run) ? keyOf(run) : keyOf({ kind: run.kind, dose: run.doses.at(-1)! })
}

/** Chaque type se regroupe sur ses jours qui se suivent, même quand une autre heure s'intercale. */
function linesOf(events: Event[], frequency: ExportFrequency): PdfHistoryLine[] {
  const sorted = [...events].sort((a, b) => compare(keyOf(a), keyOf(b)))
  const runs: Run[] = []
  const open = new Map<DoseKind, DoseRun>()
  for (const event of sorted) {
    if (isAlone(event)) {
      runs.push(event)
      continue
    }
    const run = open.get(event.kind)
    if (run && isSameSeries(run.doses.at(-1)!, event.dose, frequency)) {
      run.doses.push(event.dose)
      continue
    }
    const started = { kind: event.kind, doses: [event.dose] }
    open.set(event.kind, started)
    runs.push(started)
  }
  return runs
    .sort((a, b) => compare(lastKeyOf(b), lastKeyOf(a)) || LINE_RANK[a.kind] - LINE_RANK[b.kind])
    .map(lineOf)
}

// L'ordre d'écriture départage deux lignes d'une même échéance.
function creationOrder(a: ShownDose, b: ShownDose): number {
  const key = (dose: ShownDose) =>
    `${dose.dueOn} ${dose.dueTime ?? ''} ${dose.createdAt} ${dose.id}`
  return compare(key(a), key(b))
}

// Illisible, la dernière prise reste un fait enregistré ; seul l'historique attend une lecture du moteur.
function countedDoses({ doses, view }: TreatmentState): ShownDose[] {
  const records = new Map(doses.map((dose) => [dose.id, dose]))
  const counted =
    view === null ? doses : countedLines(view).flatMap(({ id }) => records.get(id) ?? [])
  return [...counted].sort(creationOrder)
}

// R12 : les lignes de l'historique de la fiche, celles sans effet comprises.
function historyDoses({ doses, view }: TreatmentState): (ShownDose & { idle: boolean })[] {
  const records = new Map(doses.map((dose) => [dose.id, dose]))
  const entries = view === null ? [] : historyEntries(view)
  return entries
    .flatMap(({ line, idle }) => {
      const dose = records.get(line.id)
      return dose === undefined ? [] : [{ ...dose, idle }]
    })
    .sort(creationOrder)
}

export function treatmentPeriods(state: TreatmentState): PdfTreatmentPeriod[] {
  const { periods, view } = state
  if (view === null) return []
  const lines = historyDoses(state)
  const sorted = [...periods].sort(byStartDescending)
  return sorted.flatMap((period, index): PdfTreatmentPeriod[] => {
    const severalTimes = isSeveralTimesADay(period)
    const events: Event[] = [
      ...lines
        .filter((dose) => dose.periodId === period.id)
        .flatMap((dose) =>
          dose.idle ? idleEvents(eventOf(dose, severalTimes)) : eventOf(dose, severalTimes),
        ),
      ...view.unloggedDoses
        .filter((due) => due.settingId === period.id)
        .map((due): Event => ({
          kind: 'unlogged',
          dose: { on: due.dueOn, time: severalTimes ? due.dueTime : null, extra: false },
        })),
    ]
    if (events.length === 0 && periodClosedBeforeFirstDue(period, sorted[index - 1])) return []
    return [
      {
        from: period.startsOn,
        to: periodLastDay(period, sorted[index - 1]),
        frequency: period.frequency,
        times: severalTimes ? period.times : [],
        dosage: { doseQuantity: period.doseQuantity, doseUnit: period.doseUnit },
        lines: linesOf(events, period.frequency),
      },
    ]
  })
}

export function lastIntake(state: TreatmentState): PdfDose | null {
  const given = countedDoses(state).filter(
    (dose) => dose.givenOn !== null && (dose.status === 'given' || dose.status === 'extra'),
  )
  const rank = ({ givenOn, dueOn, dueTime }: (typeof given)[number]) =>
    `${givenOn} ${dueOn} ${dueTime ?? ''}`
  const last = given.reduce<(typeof given)[number] | null>(
    (latest, dose) => (latest === null || rank(dose) > rank(latest) ? dose : latest),
    null,
  )
  return last && { on: last.givenOn!, time: null, extra: last.status === 'extra' }
}
