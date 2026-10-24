import type { NotifiedDue } from '@/shared/domain/reminder-route'
import { dueForDate, type Due, type Line, type TreatmentView } from '@/shared/domain/dose-calendar'
import { countedLines, type TreatmentReading } from '@/shared/domain/treatment-reading'
import { formatClockTime, formatDayMonthOrYear } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

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

type DayView = Pick<TreatmentView, 'slots'>

export type DayDue = { due: Due; status: 'pending' | 'given' | 'missed'; givenOn: string | null }

function dayDues(view: DayView, day: string): DayDue[] {
  return view
    .slots(day, day)
    .map(({ due, state, by }): DayDue =>
      state === 'pending' || by === null
        ? { due, status: 'pending', givenOn: null }
        : { due, status: by.status === 'given' ? 'given' : 'missed', givenOn: by.givenOn },
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

/** Les échéances d'une notification : son heure, ou toute la journée sans heure (relance). */
export function notifiedDues(view: DayView, { dueOn, dueTime }: NotifiedDue): DayDue[] {
  return dayDues(view, dueOn).filter(({ due }) => dueTime === null || due.dueTime === dueTime)
}

/**
 * Ce que « Donnée quand ? », « À faire » et la carte de la fiche notent : l'échéance nommée, ou l'une
 * des heures de sa journée ; un oubli seulement avec `reopensMissed` (feuille du soin, TR-22), jamais
 * depuis « Donnée quand ? » (Q41). Le jour choisi ne change pas l'échéance (Q28).
 */
export function notifiedPlan(
  t: Translate,
  view: DayView,
  notified: NotifiedDue,
  reopensMissed = false,
): OtherDatePlan {
  const dues = notifiedDues(view, notified)
  const open = ({ status, due }: DayDue): Due | null =>
    status === 'pending' || (reopensMissed && status === 'missed') ? due : null
  if (dues.length > 1) {
    return {
      hours: dues.map((entry) => ({ ...hourChoice(t, entry), due: open(entry) })),
      due: null,
    }
  }
  const [only] = dues
  return { hours: [], due: only === undefined ? null : open(only) }
}

function isGiven({ status }: Pick<Line, 'status'>): boolean {
  return status === 'given' || status === 'extra'
}

/** Jours dont toutes les échéances sont données, ou qui ont une prise en plus : une autre prise ne s'y note pas. */
export function givenDays(view: Pick<TreatmentView, 'history' | 'slots'>): string[] {
  const days = new Set(
    countedLines(view)
      .filter(isGiven)
      .map(({ dueOn }) => dueOn),
  )
  return [...days].filter((day) => dayDues(view, day).every(({ status }) => status === 'given'))
}

/**
 * La première échéance encore sans prise du jour de la prise ; sans échéance ce jour-là, la dose du
 * moment aujourd'hui, ou la règle sans heure (TR-13) un autre jour. Seul un autre jour corrige un
 * oubli (TR-22), et une dose à venir ne se note pas en avance quand une prise a déjà été donnée.
 * `dayNoted` : toutes les doses du jour sont notées, aucune donnée ; `null` : rien à noter.
 */
export function momentDue(
  { view, input }: TreatmentReading,
  givenOn: string,
  today: string,
): { due: Due } | { alreadyGivenOn: string } | { dayNoted: true } | null {
  const dues = dayDues(view, givenOn)
  const open =
    dues.find(({ status }) => status === 'pending') ??
    (givenOn === today ? undefined : dues.find(({ status }) => status === 'missed'))
  if (open !== undefined) return { due: open.due }
  if (dues.length > 0) {
    const given = dues.find(({ status }) => status === 'given')
    return given === undefined ? { dayNoted: true } : { alreadyGivenOn: given.givenOn ?? givenOn }
  }
  if (givenOn !== today) {
    const due = dueForDate(input, givenOn, null)
    return due === null ? null : { due }
  }
  const current = view.currentDoses[0]
  if (current === undefined) return null
  return givesBeforeItsDay(view, current, today) ? { alreadyGivenOn: today } : { due: current }
}

/** Q33 : une dose à venir n'est pas notée en avance quand une prise a déjà été donnée aujourd'hui. */
export function givesBeforeItsDay(
  view: Pick<TreatmentView, 'history'>,
  { dueOn }: Pick<Due, 'dueOn'>,
  today: string,
): boolean {
  return dueOn > today && countedLines(view).some((line) => isGiven(line) && line.givenOn === today)
}

type MomentTarget = ReturnType<typeof momentDue>

/**
 * Ce que note « C'est fait » d'une notification sans heure : jour entièrement noté, « déjà notée »
 * (ou `dayNoted`) ; journée entamée ou dose d'un autre jour que celui notifié, `ask`, rien n'est
 * écrit ; sinon la dose que vise `momentDue`.
 */
export function notifiedDue(
  reading: TreatmentReading,
  notifiedDueOn: string,
  today: string,
): MomentTarget | 'ask' {
  const dues = dayDues(reading.view, notifiedDueOn)
  const noted = dues.filter(({ status }) => status !== 'pending')
  if (noted.length > 0) {
    if (noted.length < dues.length) return 'ask'
    const given = noted.find(({ status }) => status === 'given')
    return given === undefined
      ? { dayNoted: true }
      : { alreadyGivenOn: given.givenOn ?? notifiedDueOn }
  }
  const target = momentDue(reading, today, today)
  return target !== null && 'due' in target && target.due.dueOn !== notifiedDueOn ? 'ask' : target
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
