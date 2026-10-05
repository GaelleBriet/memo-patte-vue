import type { Due, TreatmentDoseInput, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
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
    dose.dueOn === day && (dose.status === 'given' || dose.status === 'missed')
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

function isGiven({ status }: Pick<TreatmentDoseInput, 'status'>): boolean {
  return status === 'given' || status === 'extra'
}

/** Jours dont toutes les échéances sont données, ou qui ont une prise en plus : une autre prise ne s'y note pas. */
export function givenDays(schedule: DaySchedule): string[] {
  const days = new Set(schedule.doses.filter(isGiven).map(({ dueOn }) => dueOn))
  return [...days].filter((day) => dayDues(schedule, day).every(({ status }) => status === 'given'))
}

/**
 * Transition, tant que la feuille « À faire » et les notifications ne visent pas une heure
 * (lots 4 et 7) : la première échéance encore sans prise du jour de la prise ; sans échéance ce
 * jour-là, la dose du moment aujourd'hui, ou la règle sans heure (TR-13) un autre jour. Aujourd'hui,
 * une dose notée oubliée ne repasse jamais en donnée, et une dose à venir ne se note pas en avance
 * quand une prise a déjà été donnée ; un autre jour, choisi par la personne, un oubli se corrige
 * (TR-22). `dayNoted` : toutes les doses du jour sont notées, aucune donnée. `null` : rien à noter.
 */
export function momentDue(
  schedule: OtherDateSchedule,
  givenOn: string,
  today: string,
): { due: Due } | { alreadyGivenOn: string } | { dayNoted: true } | null {
  const dues = dayDues(schedule, givenOn)
  const open =
    dues.find(({ status }) => status === 'pending') ??
    (givenOn === today ? undefined : dues.find(({ status }) => status === 'missed'))
  if (open !== undefined) return { due: open.due }
  if (dues.length > 0) {
    const given = dues.find(({ status }) => status === 'given')
    return given === undefined ? { dayNoted: true } : { alreadyGivenOn: given.givenOn ?? givenOn }
  }
  if (givenOn !== today) {
    const due = schedule.dueForDate(givenOn)
    return due === null ? null : { due }
  }
  const current = schedule.currentDoses[0]
  if (current === undefined) return null
  const givenToday = schedule.doses.some((dose) => isGiven(dose) && dose.givenOn === today)
  return current.dueOn > today && givenToday ? { alreadyGivenOn: today } : { due: current }
}

type MomentTarget = ReturnType<typeof momentDue>

/**
 * Transition (lot 4) : ce que note « C'est fait » d'une notification, qui porte un jour d'échéance
 * et pas d'heure. Dans l'ordre : jour entièrement noté, « déjà notée » (ou `dayNoted` sans prise
 * donnée) ; journée entamée, `ask` ; dose à noter d'un autre jour que celui notifié, `ask` ; sinon
 * la dose que vise `momentDue`. `ask` : à la personne de choisir, rien n'est écrit.
 */
export function notifiedDue(
  schedule: OtherDateSchedule,
  notifiedDueOn: string,
  today: string,
): MomentTarget | 'ask' {
  const dues = dayDues(schedule, notifiedDueOn)
  const noted = dues.filter(({ status }) => status !== 'pending')
  if (noted.length > 0) {
    if (noted.length < dues.length) return 'ask'
    const given = noted.find(({ status }) => status === 'given')
    return given === undefined
      ? { dayNoted: true }
      : { alreadyGivenOn: given.givenOn ?? notifiedDueOn }
  }
  const target = momentDue(schedule, today, today)
  return target !== null && 'due' in target && target.due.dueOn !== notifiedDueOn ? 'ask' : target
}

/**
 * Heures que la feuille « À faire » demande avant d'écrire : celles de la journée que viserait
 * `momentDue`, quand elle en a plusieurs. Vide : un tap suffit, ou il n'y a rien à noter.
 */
export function sheetHours(
  t: Translate,
  schedule: OtherDateSchedule,
  givenOn: string,
  today: string,
): HourChoice[] {
  const target = momentDue(schedule, givenOn, today)
  if (target === null || !('due' in target)) return []
  const timed = dayDues(schedule, target.due.dueOn).filter(({ due }) => due.dueTime !== null)
  if (timed.length < 2) return []
  return timed.map((entry) => {
    const choice = hourChoice(t, entry)
    return entry.status === 'missed' && givenOn === today ? { ...choice, due: null } : choice
  })
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
