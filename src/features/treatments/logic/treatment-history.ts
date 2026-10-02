import { doseDay } from './treatment-dose'
import { addFrequency } from './treatment-frequency'
import type { DoseDates } from '../repository/treatment-doses.repository'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { Treatment } from '../schema/treatment.schema'
import { dueDelayText } from '@/shared/domain/due-delay'
import {
  formatDayMonthOrYear,
  formatFullDate,
  formatLongDate,
  formatMonthYear,
  nonBreaking,
} from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

/** Au-delà, les prises se regroupent par année. */
export const DOSES_IN_A_LIST = 12

export type DoseYear = { year: string; doses: TreatmentDose[] }

export type DoseHistory = {
  /** La dernière prise, montrée à part tant que le traitement est en cours. */
  head: TreatmentDose | null
  others: { kind: 'list'; doses: TreatmentDose[] } | { kind: 'years'; groups: DoseYear[] }
}

/** La première ligne n'est la tête que si elle appartient à la période en cours. */
function headOf(doses: TreatmentDose[], periodId?: string): TreatmentDose | null {
  const first = doses[0]
  if (!first) return null
  return periodId === undefined || first.periodId === periodId ? first : null
}

/** `doses` : la tête d'abord, comme le repository les rend. */
export function doseHistory(
  doses: TreatmentDose[],
  { ongoing, periodId }: { ongoing: boolean; periodId?: string },
): DoseHistory {
  const head = ongoing ? headOf(doses, periodId) : null
  const others = head ? doses.slice(1) : doses
  if (doses.length <= DOSES_IN_A_LIST) return { head, others: { kind: 'list', doses: others } }

  const groups: DoseYear[] = []
  for (const dose of others) {
    const year = doseDay(dose).slice(0, 4)
    const last = groups.at(-1)
    if (last?.year === year) last.doses.push(dose)
    else groups.push({ year, doses: [dose] })
  }
  return { head, others: { kind: 'years', groups } }
}

export type RedatedDose = {
  dates: DoseDates
  /** La dernière prise gardait un report manuel, encore après sa nouvelle date : il n'a pas bougé. */
  postponementKept: boolean
}

/**
 * Prise déplacée : elle vise sa nouvelle date, et sa prochaine dose la suit, sauf un report manuel
 * qui reste après elle.
 */
export function redatedDose(
  dose: Pick<TreatmentDose, 'givenOn' | 'dueOn' | 'nextDueDate' | 'frequency'>,
  givenOn: string,
  { isHead }: { isHead: boolean },
): RedatedDose {
  const kept =
    dose.nextDueDate !== addFrequency(doseDay(dose), dose.frequency) && dose.nextDueDate > givenOn
  return {
    dates: {
      givenOn,
      dueOn: givenOn,
      nextDueDate: kept ? dose.nextDueDate : addFrequency(givenOn, dose.frequency),
    },
    postponementKept: kept && isHead,
  }
}

type HeadOrder = Pick<TreatmentDose, 'dueOn' | 'dueTime' | 'createdAt' | 'id'>

function isBefore(a: HeadOrder, b: HeadOrder): boolean {
  if (a.dueOn !== b.dueOn) return a.dueOn < b.dueOn
  if (a.dueTime !== b.dueTime) return (a.dueTime ?? '') < (b.dueTime ?? '')
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt
  return a.id < b.id
}

/** Même ordre que la tête en base : échéance, jour puis heure, puis saisie, puis identifiant. */
export function becomesHead(doses: TreatmentDose[], dose: TreatmentDose, givenOn: string): boolean {
  const moved = { ...dose, dueOn: givenOn }
  return doses.every((other) => other.id === dose.id || isBefore(other, moved))
}

export function treatmentDetailTexts(
  t: Translate,
  treatment: Treatment,
  { animal, today, doses }: { animal: string; today: string; doses: TreatmentDose[] },
) {
  const { name, frequency, stoppedOn } = treatment
  const oldest = doses.at(-1)
  const previous = doses.length - (headOf(doses, treatment.periodId) ? 1 : 0)

  return {
    subtitle: t('treatments.detail.subtitle', {
      type: t(`treatments.type.${treatment.type}`),
      animal,
    }),
    frequency: t(`treatments.frequency.${frequency.unit}`, { n: frequency.value }, frequency.value),
    due:
      stoppedOn === null
        ? {
            date: formatLongDate(treatment.nextDueDate),
            delay: dueDelayText(t, treatment.nextDueDate, today),
          }
        : null,
    doneLabel: t('treatments.detail.doneLabel', { name, animal }),
    counter:
      stoppedOn === null && oldest
        ? t('treatments.detail.since', {
            n: doses.length,
            month: formatMonthYear(doseDay(oldest)),
          })
        : String(doses.length),
    headDetail: t('treatments.detail.setDose', {
      date: formatDayMonthOrYear(treatment.nextDueDate, today),
    }),
    showPrevious: t('treatments.detail.showPrevious', { n: previous }, previous),
    stopped:
      stoppedOn === null
        ? null
        : {
            notice: t('treatments.detail.stopped', { date: formatLongDate(stoppedOn) }),
            wasFrequency: t('treatments.detail.wasFrequency', {
              frequency: t(
                `treatments.sheet.frequency.${frequency.unit}`,
                { n: frequency.value },
                frequency.value,
              ),
            }),
          },
    year: ({ year, doses: ofYear }: DoseYear) =>
      t('treatments.detail.year', { year, n: ofYear.length }, ofYear.length),
    dose: (dose: TreatmentDose) => ({
      date: formatLongDate(doseDay(dose)),
      optionsLabel: t('treatments.detail.options', { date: formatFullDate(doseDay(dose)) }),
    }),
  }
}

export type FinishedTreatmentRow = { id: string; name: string; detail: string }

export function finishedTreatmentRows(
  t: Translate,
  treatments: Treatment[],
  doseCounts: Record<string, number>,
): FinishedTreatmentRow[] {
  return treatments.flatMap((treatment) => {
    if (treatment.stoppedOn === null) return []
    const count = doseCounts[treatment.id] ?? 0
    return [
      {
        id: treatment.id,
        name: treatment.name,
        detail: t(
          'treatments.finished.row',
          { date: formatLongDate(treatment.stoppedOn), n: count },
          count,
        ),
      },
    ]
  })
}

/** Jours déjà pris par les autres prises : une prise ne s'y déplace pas. */
export function doseDatesExcept(doses: TreatmentDose[], id: string): string[] {
  return doses.flatMap((dose) => (dose.id === id || dose.givenOn === null ? [] : [dose.givenOn]))
}

/** Textes de « Changer la date » et « Supprimer cette prise », et de leur toast. */
export function doseGestureTexts(t: Translate, givenOn: string, today: string) {
  return {
    changeDateSubtitle: t('treatments.detail.changeDateSubtitle', {
      date: formatLongDate(givenOn),
    }),
    removed: t('treatments.detail.toast.removed', { date: formatDayMonthOrYear(givenOn, today) }),
    undoRemove: t('treatments.detail.toast.undoRemove', { date: formatFullDate(givenOn) }),
    /** `keptNextDue` : la prochaine dose reportée à la main, restée à sa date. */
    moved: (date: string, keptNextDue: string | null = null) =>
      keptNextDue === null
        ? t('treatments.detail.toast.moved', { date: formatDayMonthOrYear(date, today) })
        : t('treatments.detail.toast.movedKept', {
            // Le point d'abréviation (« juil. ») sert aussi de point final à la phrase.
            date: nonBreaking(formatDayMonthOrYear(date, today).replace(/\.$/, '')),
            nextDue: nonBreaking(formatDayMonthOrYear(keptNextDue, today)),
          }),
    undoMove: t('treatments.detail.toast.undoMove'),
  }
}

/** Dialogue de suppression d'un traitement, depuis son menu ou sa seule prise. */
export function treatmentDeleteTexts(
  t: Translate,
  name: string,
  { onlyDose }: { onlyDose: boolean },
) {
  return {
    title: t('treatments.detail.deleteDialog.title', { name }),
    text: onlyDose
      ? t('treatments.detail.deleteDialog.onlyDose', { name })
      : t('treatments.detail.deleteDialog.text'),
    cancel: t('treatments.detail.deleteDialog.cancel'),
    confirm: t('treatments.detail.deleteDialog.confirm'),
    deleted: t('treatments.detail.toast.deleted', { name }),
    failed: t('treatments.detail.errors.delete', { name }),
  }
}
