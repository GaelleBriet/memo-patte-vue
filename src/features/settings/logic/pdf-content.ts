import { differenceInCalendarDays, format, parseISO } from 'date-fns'

import { EXPORT_FILE_TIME } from './export-format'
import { treatmentStates, type TreatmentOutlook, type TreatmentState } from './treatment-outlook'
import { buildReminders, type ReminderKind } from '@/shared/domain/reminders'
import type { ExportData, ExportFrequency } from '@/shared/domain/carnet-data'
import { vaccinationHistories } from '@/shared/domain/carnet-heads'
import type { Dosage } from '@/shared/domain/dosage'
import { isStoppedBeforeItsFirstDue } from '@/shared/domain/treatment-end'
import { byStartDescending, periodLastDay } from '@/shared/domain/treatment-periods'
import { isAdvanced, type TreatmentDoseInput } from '@/shared/domain/treatment-schedule'

export type PdfDueState = 'overdue' | 'upToDate' | 'planned' | 'none'

export type PdfVaccinationRow = {
  name: string
  /** `null` : vaccin prévu, jamais fait. */
  lastInjectionDate: string | null
  /** Toutes les injections, la plus récente d'abord : un vaccin n'est jamais regroupé. */
  injectionDates: string[]
  dueDate: string | null
  /** `null` : animal qu'on ne suit plus, sans statut. */
  state: PdfDueState | null
}

/** `time` : seulement quand la période a plusieurs heures. */
export type PdfDose = { on: string; time: string | null; extra: boolean }

/**
 * Listées jusqu'à trois, la plus récente d'abord, résumées au-delà ; `time` : l'heure commune à toute
 * la série, quand la période en a plusieurs.
 */
export type PdfDoseSeries =
  | { kind: 'dates'; doses: PdfDose[] }
  | { kind: 'range'; count: number; from: string; to: string; time: string | null }

export type PdfHistoryLine =
  | { kind: 'given'; series: PdfDoseSeries }
  | { kind: 'missed'; series: PdfDoseSeries }
  | { kind: 'unlogged'; from: string; to: string; time: string | null }
  | { kind: 'moved'; dueOn: string; to: string; advanced: boolean }

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

export type PdfTreatmentRow = {
  name: string
  /** `null` : aucune prise donnée. */
  lastDoseDate: string | null
  /** La dernière prise est une prise en plus. */
  lastDoseExtra: boolean
  /** La plus récente d'abord. */
  periods: PdfTreatmentPeriod[]
  due: TreatmentOutlook
  /** `null` : animal qu'on ne suit plus, sans statut. */
  state: PdfDueState | null
}

export type PdfWeightRow = {
  measuredOn: string
  weightKg: number
}

export type CarnetPdfContent = {
  animal: {
    name: string
    species: 'dog' | 'cat'
    breed: string | null
    birthDate: string | null
    birthDateApproximate: boolean
    /** Date du départ d'un animal qu'on ne suit plus, quand elle a été renseignée. */
    departureDate: string | null
    photoFileName: string | null
  }
  generatedOn: string
  vaccinations: PdfVaccinationRow[]
  treatments: PdfTreatmentRow[]
  weightEntries: PdfWeightRow[]
}

function dueState(dueDate: string | null, today: string, kind: ReminderKind): PdfDueState {
  if (dueDate === null) return 'none'
  const { overdue } = buildReminders([{ kind, id: '', animalId: '', label: '', dueDate }], {
    today,
  })
  return overdue > 0 ? 'overdue' : 'upToDate'
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
  { kind: DoseKind; dose: PdfDose } | { kind: 'moved'; time: string | null; line: MovedLine }

type MovedLine = Extract<PdfHistoryLine, { kind: 'moved' }>

function eventOf(
  dose: Pick<TreatmentDoseInput, 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'nextDueDate'>,
  severalTimes: boolean,
): Event[] {
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
            to: dose.nextDueDate,
            advanced: isAdvanced(dose),
          },
        },
      ]
    case 'shift':
      return []
  }
}

function keyOf(event: Event): string {
  return event.kind === 'moved'
    ? `${event.line.dueOn} ${event.time ?? ''}`
    : `${event.dose.on} ${event.dose.time ?? ''}`
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

// Lue de la plus récente, sur une même échéance : le report, puis la prise, l'oubli, le non renseigné.
const LINE_RANK: Record<Event['kind'], number> = { moved: 0, given: 1, missed: 2, unlogged: 3 }

type DoseRun = { kind: DoseKind; doses: PdfDose[] }

type Run = DoseRun | Extract<Event, { kind: 'moved' }>

function lineOf(run: Run): PdfHistoryLine {
  if (run.kind === 'moved') return run.line
  if (run.kind !== 'unlogged') return { kind: run.kind, series: seriesOf(run.doses) }
  const [first, last] = [run.doses[0]!, run.doses.at(-1)!]
  return { kind: 'unlogged', from: first.on, to: last.on, time: commonTime(run.doses) }
}

function lastKeyOf(run: Run): string {
  return run.kind === 'moved' ? keyOf(run) : keyOf({ kind: run.kind, dose: run.doses.at(-1)! })
}

/** Chaque type se regroupe sur ses jours qui se suivent, même quand une autre heure s'intercale. */
function linesOf(events: Event[], frequency: ExportFrequency): PdfHistoryLine[] {
  const sorted = [...events].sort((a, b) => compare(keyOf(a), keyOf(b)))
  const runs: Run[] = []
  const open = new Map<DoseKind, DoseRun>()
  for (const event of sorted) {
    if (event.kind === 'moved') {
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

function treatmentPeriods({ periods, doses, schedule }: TreatmentState): PdfTreatmentPeriod[] {
  const lines = schedule?.doses ?? doses
  const unlogged = schedule?.unloggedDoses ?? []
  const sorted = [...periods].sort(byStartDescending)
  return sorted.flatMap((period, index): PdfTreatmentPeriod[] => {
    const severalTimes = period.times.length > 1
    const events: Event[] = [
      ...lines
        .filter((dose) => dose.periodId === period.id)
        .flatMap((dose) => eventOf(dose, severalTimes)),
      ...unlogged
        .filter((due) => due.periodId === period.id)
        .map((due): Event => ({
          kind: 'unlogged',
          dose: { on: due.dueOn, time: severalTimes ? due.dueTime : null, extra: false },
        })),
    ]
    if (events.length === 0 && isStoppedBeforeItsFirstDue(period)) return []
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

function lastGiven({ doses, schedule }: TreatmentState): PdfDose | null {
  const given = (schedule?.doses ?? doses).filter(
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

function byDueDateAscending(a: { dueDate: string | null }, b: { dueDate: string | null }): number {
  if (a.dueDate === null || b.dueDate === null) {
    return Number(a.dueDate === null) - Number(b.dueDate === null)
  }
  return a.dueDate.localeCompare(b.dueDate)
}

function treatmentState(due: TreatmentOutlook): PdfDueState {
  if (due.kind !== 'due') return 'none'
  return due.overdue ? 'overdue' : 'upToDate'
}

function dueKey(due: TreatmentOutlook): { dueDate: string | null } {
  return { dueDate: due.kind === 'due' ? `${due.dueOn} ${due.dueTime ?? ''}` : null }
}

export function buildCarnetPdfContent(
  data: ExportData,
  animalId: string,
  today: string,
): CarnetPdfContent | null {
  const animal = data.animals.find((item) => item.id === animalId)
  if (!animal) return null

  const followed = animal.unfollowedOn === null
  const injections = vaccinationHistories(data.vaccinationInjections)
  const states = treatmentStates(data, today)
  const treatedIds = new Set(data.treatmentPeriods.map(({ treatmentId }) => treatmentId))

  const vaccinations: PdfVaccinationRow[] = data.vaccinations
    .filter((item) => item.animalId === animalId)
    .map((item) => {
      const history = injections.get(item.id) ?? []
      const head = history[0]
      const dueDate = head ? head.nextDueDate : item.plannedDueDate
      const state = dueState(dueDate, today, 'vaccination')
      return {
        name: item.name,
        lastInjectionDate: head?.injectedOn ?? null,
        injectionDates: history.map(({ injectedOn }) => injectedOn),
        dueDate,
        state: !followed ? null : !head && state === 'upToDate' ? 'planned' : state,
      }
    })
    .sort(byDueDateAscending)

  const treatments: PdfTreatmentRow[] = data.treatments
    .filter((item) => item.animalId === animalId && treatedIds.has(item.id))
    .map((item) => {
      const state = states(item.id)
      const periods = treatmentPeriods(state)
      const last = lastGiven(state)
      return {
        name: item.name,
        lastDoseDate: last?.on ?? null,
        lastDoseExtra: last?.extra ?? false,
        periods,
        due: state.outlook,
        state: followed ? treatmentState(state.outlook) : null,
      }
    })
    .sort((a, b) => byDueDateAscending(dueKey(a.due), dueKey(b.due)))

  const weightEntries: PdfWeightRow[] = data.weightEntries
    .filter((item) => item.animalId === animalId)
    .map((item) => ({ measuredOn: item.measuredOn, weightKg: item.weightKg }))
    .sort((a, b) => a.measuredOn.localeCompare(b.measuredOn))

  return {
    animal: {
      name: animal.name,
      species: animal.species,
      breed: animal.breed,
      birthDate: animal.birthDate,
      birthDateApproximate: animal.birthDateApproximate,
      departureDate: animal.unfollowedOn === null ? null : animal.departureDate,
      photoFileName: animal.photoFileName,
    },
    generatedOn: today,
    vaccinations,
    treatments,
    weightEntries,
  }
}

function slug(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '')
}

export function pdfExportFileName(
  label: string,
  animalNames: readonly string[],
  exportedAt: Date,
): string {
  const subject = animalNames.length === 1 ? slug(animalNames[0]!) : 'memopatte'
  const parts = [slug(label), subject, format(exportedAt, EXPORT_FILE_TIME)]
  return `${parts.filter(Boolean).join('-')}.pdf`
}
