import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { formatClockTime, formatDayMonthOrYear } from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type HourChoice = {
  time: string
  label: string
  detail: string
  /** Échéance que noterait ce choix ; `null` : déjà donnée, rien à noter. */
  due: Due | null
}

export type OtherDatePlan = {
  /** Heures à proposer ; vide : le jour choisi suffit. */
  hours: HourChoice[]
  /** Sans heure à choisir, l'échéance que note ce jour ; `null` : déjà donnée. */
  due: Due | null
}

type DaySchedule = Pick<TreatmentSchedule, 'doses' | 'unloggedDoses' | 'currentDoses'>
type OtherDateSchedule = DaySchedule & Pick<TreatmentSchedule, 'dueForDate'>

type DayDue = { due: Due; status: 'pending' | 'given' | 'missed'; givenOn: string | null }

function dueOf({ periodId, dueOn, dueTime }: Due): Due {
  return { periodId, dueOn, dueTime }
}

function dayDues(schedule: DaySchedule, day: string): DayDue[] {
  const notes = schedule.doses.flatMap((dose): DayDue[] =>
    dose.dueOn === day && dose.status !== 'postponed'
      ? [{ due: dueOf(dose), status: dose.status, givenOn: dose.givenOn }]
      : [],
  )
  const pending = [...schedule.unloggedDoses, ...schedule.currentDoses]
    .filter((due) => due.dueOn === day)
    .map((due): DayDue => ({ due, status: 'pending', givenOn: null }))
  return [...notes, ...pending].sort((a, b) =>
    (a.due.dueTime ?? '') < (b.due.dueTime ?? '') ? -1 : 1,
  )
}

function hourChoice(t: Translate, { due, status }: DayDue): HourChoice {
  const time = due.dueTime ?? ''
  const label = formatClockTime(time)
  if (status === 'given') {
    return {
      time,
      label,
      detail: t('treatments.detail.otherDate.hour.given', { time: label }),
      due: null,
    }
  }
  return {
    time,
    label,
    detail:
      status === 'pending'
        ? t('treatments.detail.otherDate.hour.pending', { time: label })
        : t('treatments.detail.otherDate.hour.missed', { time: label }),
    due,
  }
}

/** Ce que « Fait à une autre date » demande et note pour le jour choisi. */
export function otherDatePlan(
  t: Translate,
  schedule: OtherDateSchedule,
  givenOn: string,
): OtherDatePlan {
  const dues = dayDues(schedule, givenOn)
  const timed = dues.filter(({ due }) => due.dueTime !== null)
  if (timed.length > 1) return { hours: timed.map((entry) => hourChoice(t, entry)), due: null }
  const [only] = dues
  if (only === undefined) return { hours: [], due: schedule.dueForDate(givenOn) }
  return { hours: [], due: only.status === 'given' ? null : only.due }
}

/** Jours dont toutes les échéances sont données : une autre prise ne s'y note pas. */
export function givenDays(schedule: DaySchedule): string[] {
  const days = new Set(
    schedule.doses.filter(({ status }) => status === 'given').map(({ dueOn }) => dueOn),
  )
  return [...days].filter((day) => dayDues(schedule, day).every(({ status }) => status === 'given'))
}

/**
 * Transition, tant que la feuille « À faire » et les notifications ne visent pas une heure
 * (lots 4 et 7) : la première échéance encore sans prise du jour de la prise, à défaut la première
 * oubliée ; sans échéance ce jour-là, la dose du moment aujourd'hui, ou la règle sans heure (TR-13)
 * un autre jour. Une dose à venir ne se note pas en avance le jour où une prise a déjà été donnée.
 * `null` : rien à noter.
 */
export function momentDue(
  schedule: OtherDateSchedule,
  givenOn: string,
  today: string,
): { due: Due } | { alreadyGivenOn: string } | null {
  const dues = dayDues(schedule, givenOn)
  const open =
    dues.find(({ status }) => status === 'pending') ??
    dues.find(({ status }) => status === 'missed')
  if (open !== undefined) return { due: open.due }
  const given = dues[0]
  if (given !== undefined) return { alreadyGivenOn: given.givenOn ?? givenOn }
  if (givenOn !== today) {
    const due = schedule.dueForDate(givenOn)
    return due === null ? null : { due }
  }
  const current = schedule.currentDoses[0]
  if (current === undefined) return null
  const givenToday = schedule.doses.some(
    (dose) => dose.status === 'given' && dose.givenOn === today,
  )
  return current.dueOn > today && givenToday ? { alreadyGivenOn: today } : { due: current }
}

/** Transition (lot 4) : une prise, donnée ou oubliée, est déjà notée pour ce jour d'échéance. */
export function isDayNoted(schedule: Pick<TreatmentSchedule, 'doses'>, dueOn: string): boolean {
  return schedule.doses.some((dose) => dose.dueOn === dueOn && dose.status !== 'postponed')
}

export function otherDateTexts(
  t: Translate,
  { name, animal, today }: { name: string; animal: string; today: string },
  givenOn: string,
  severalTimes: boolean,
) {
  const date = formatDayMonthOrYear(givenOn, today)
  return {
    daySubtitle: t('treatments.sheet.otherDay.subtitle', { name, animal }),
    submit: severalTimes
      ? t('treatments.detail.otherDate.next')
      : givenOn === today
        ? t('treatments.sheet.otherDay.submitToday')
        : t('treatments.sheet.otherDay.submit', { date }),
    hourTitle: t('treatments.detail.otherDate.hourTitle'),
    hourSubtitle: t('treatments.detail.otherDate.hourSubtitle', { name, animal, date }),
  }
}
