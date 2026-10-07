import { differenceInCalendarDays, format, parseISO, subDays } from 'date-fns'

import { EXPORT_FILE_TIME } from './export-format'
import { treatmentStates, type TreatmentOutlook, type TreatmentState } from './treatment-outlook'
import { buildReminders, type ReminderKind } from '@/shared/domain/reminders'
import type {
  ExportData,
  ExportFrequency,
  ExportTreatmentPeriod,
} from '@/shared/domain/carnet-data'
import { vaccinationHistories } from '@/shared/domain/carnet-heads'
import type { Dosage } from '@/shared/domain/dosage'
import { isAdvanced, type TreatmentDoseInput } from '@/shared/domain/treatment-schedule'

export type PdfDueState = 'overdue' | 'upToDate' | 'planned' | 'none'

export type PdfVaccinationRow = {
  name: string
  /** `null` : vaccin prévu, jamais fait. */
  lastInjectionDate: string | null
  /** Toutes les injections, la plus récente d'abord : un vaccin n'est jamais regroupé. */
  injectionDates: string[]
  dueDate: string | null
  state: PdfDueState
}

/** `time` : seulement quand la période a plusieurs heures. */
export type PdfDose = { on: string; time: string | null; extra: boolean }

/** Listées jusqu'à trois, résumées au-delà ; la plus récente d'abord. */
export type PdfDoseSeries =
  { kind: 'dates'; doses: PdfDose[] } | { kind: 'range'; count: number; from: string; to: string }

export type PdfHistoryLine =
  | { kind: 'given'; series: PdfDoseSeries }
  | { kind: 'missed'; series: PdfDoseSeries }
  | { kind: 'unlogged'; from: string; to: string }
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
  state: PdfDueState
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

function seriesOf(doses: PdfDose[]): PdfDoseSeries {
  return doses.length <= MAX_LISTED_DOSES
    ? { kind: 'dates', doses: [...doses].reverse() }
    : { kind: 'range', count: doses.length, from: doses[0]!.on, to: doses.at(-1)!.on }
}

type Event =
  | { kind: 'given' | 'missed'; slot: string; dose: PdfDose }
  | { kind: 'unlogged'; slot: string; on: string }
  | { kind: 'moved'; slot: string; dueOn: string; to: string; advanced: boolean }

// Sur une même échéance, la prise puis le report : lue de la plus récente, la ligne du report d'abord.
const EVENT_RANK: Record<Event['kind'], number> = { given: 0, missed: 0, unlogged: 0, moved: 1 }

function slotOf({ dueOn, dueTime }: { dueOn: string; dueTime: string | null }): string {
  return `${dueOn} ${dueTime ?? ''}`
}

function eventOf(
  dose: Pick<TreatmentDoseInput, 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'nextDueDate'>,
  severalTimes: boolean,
): Event[] {
  const slot = slotOf(dose)
  const time = severalTimes ? dose.dueTime : null
  switch (dose.status) {
    case 'given':
    case 'extra':
      if (dose.givenOn === null) return []
      return [
        { kind: 'given', slot, dose: { on: dose.givenOn, time, extra: dose.status === 'extra' } },
      ]
    case 'missed':
      return [{ kind: 'missed', slot, dose: { on: dose.dueOn, time, extra: false } }]
    case 'postponed':
      return [
        {
          kind: 'moved',
          slot,
          dueOn: dose.dueOn,
          to: dose.nextDueDate,
          advanced: isAdvanced(dose),
        },
      ]
    case 'shift':
      return []
  }
}

type Group =
  | { kind: 'given' | 'missed'; doses: PdfDose[] }
  | Extract<PdfHistoryLine, { kind: 'unlogged' | 'moved' }>

function linesOf(events: Event[], frequency: ExportFrequency): PdfHistoryLine[] {
  const sorted = [...events].sort(
    (a, b) =>
      (a.slot < b.slot ? -1 : a.slot > b.slot ? 1 : 0) || EVENT_RANK[a.kind] - EVENT_RANK[b.kind],
  )
  const groups: Group[] = []
  for (const event of sorted) {
    const last = groups.at(-1)
    if (event.kind === 'unlogged') {
      if (last?.kind === 'unlogged') last.to = event.on
      else groups.push({ kind: 'unlogged', from: event.on, to: event.on })
    } else if (event.kind === 'moved') {
      groups.push({ kind: 'moved', dueOn: event.dueOn, to: event.to, advanced: event.advanced })
    } else if (
      last?.kind === event.kind &&
      isSameSeries(last.doses.at(-1)!, event.dose, frequency)
    ) {
      last.doses.push(event.dose)
    } else {
      groups.push({ kind: event.kind, doses: [event.dose] })
    }
  }
  return groups
    .map((group): PdfHistoryLine =>
      'doses' in group ? { kind: group.kind, series: seriesOf(group.doses) } : group,
    )
    .reverse()
}

function byStartDescending(a: ExportTreatmentPeriod, b: ExportTreatmentPeriod): number {
  const [left, right] = [a, b].map(
    ({ startsOn, createdAt, id }) => `${startsOn} ${createdAt} ${id}`,
  )
  return left! < right! ? 1 : left! > right! ? -1 : 0
}

function lastDayOf(
  period: ExportTreatmentPeriod,
  next: ExportTreatmentPeriod | undefined,
): string | null {
  const beforeNext =
    next === undefined ? null : format(subDays(parseISO(next.startsOn), 1), 'yyyy-MM-dd')
  return (
    [period.endsOn, period.stoppedOn, beforeNext].filter((day) => day !== null).sort()[0] ?? null
  )
}

function treatmentPeriods({ periods, doses, schedule }: TreatmentState): PdfTreatmentPeriod[] {
  const lines = schedule?.doses ?? doses
  const unlogged = schedule?.unloggedDoses ?? []
  return [...periods].sort(byStartDescending).map((period, index, sorted) => {
    const severalTimes = period.times.length > 1
    const events: Event[] = [
      ...lines
        .filter((dose) => dose.periodId === period.id)
        .flatMap((dose) => eventOf(dose, severalTimes)),
      ...unlogged
        .filter((due) => due.periodId === period.id)
        .map((due): Event => ({ kind: 'unlogged', slot: slotOf(due), on: due.dueOn })),
    ]
    return {
      from: period.startsOn,
      to: lastDayOf(period, sorted[index - 1]),
      frequency: period.frequency,
      times: severalTimes ? period.times : [],
      dosage: { doseQuantity: period.doseQuantity, doseUnit: period.doseUnit },
      lines: linesOf(events, period.frequency),
    }
  })
}

function lastGiven(periods: PdfTreatmentPeriod[]): PdfDose | null {
  const given = periods.flatMap(({ lines }) =>
    lines.flatMap((line): PdfDose[] => {
      if (line.kind !== 'given') return []
      return line.series.kind === 'dates'
        ? line.series.doses
        : [{ on: line.series.to, time: null, extra: false }]
    }),
  )
  return given.reduce<PdfDose | null>(
    (last, dose) => (last === null || dose.on > last.on ? dose : last),
    null,
  )
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
        state: !head && state === 'upToDate' ? 'planned' : state,
      }
    })
    .sort(byDueDateAscending)

  const treatments: PdfTreatmentRow[] = data.treatments
    .filter((item) => item.animalId === animalId && treatedIds.has(item.id))
    .map((item) => {
      const state = states(item.id)
      const periods = treatmentPeriods(state)
      const last = lastGiven(periods)
      return {
        name: item.name,
        lastDoseDate: last?.on ?? null,
        lastDoseExtra: last?.extra ?? false,
        periods,
        due: state.outlook,
        state: treatmentState(state.outlook),
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
