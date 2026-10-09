import { format, parseISO, subDays } from 'date-fns'

import { doseChange, type DoseAction } from './treatment-dose-writes'
import { revealedDues, revealedDuesText } from './treatment-revealed-dues'
import { treatmentScheduleOf } from './treatment-schedule-adapter'
import type { DoseWrite } from '../repository/treatment-doses.repository'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { DoseGesture, Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import {
  formatClockTime,
  formatDayMonthOrYear,
  formatDaySeries,
  formatWeekday,
  formatWeekdayDayMonth,
  withoutFinalDot,
} from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

type History = Pick<TreatmentWithHistory, 'id' | 'animalId' | 'periods' | 'doses'>

/** L'aide sous la case ; `warning` : le décalage ferait perdre une dose à cause de la date de fin. */
export type ShiftHelp = { text: string; warning: boolean }

/** Ce que la case montre pour la date et l'état choisis ; `shown` faux : pas de case pour ce jour. */
export type ShiftBoxView = {
  shown: boolean
  help: ShiftHelp | null
  /** À ce jour, le geste est refusé avec cet état de la case (Q2 a). */
  blocked?: boolean
}

const SHOWN_DAYS = 2
const PREVIEW_AT = '9999-12-31T23:59:59.999Z'

/** Les lignes du carnet une fois ces écritures faites. */
export function dosesAfter(
  doses: readonly NewTreatmentDose[],
  writes: readonly DoseWrite[],
): NewTreatmentDose[] {
  return writes.reduce<NewTreatmentDose[]>(
    (lines, write) => {
      switch (write.action) {
        case 'delete':
          return lines.filter(({ id }) => id !== write.id)
        case 'rewrite':
          return lines.map((line) =>
            line.id === write.id ? { ...line, ...write.dose, updatedAt: PREVIEW_AT } : line,
          )
        case 'create': {
          const { id, treatmentId, animalId, dose } = write
          const stamps = { createdAt: PREVIEW_AT, updatedAt: PREVIEW_AT, deletedAt: null }
          return [...lines, { ...dose, id, treatmentId, animalId, ...stamps }]
        }
        case 'restore':
          return lines
      }
    },
    [...doses],
  )
}

/** Le calendrier après le geste ; `null` quand le moteur le refuse. */
function scheduleAfter(
  history: History,
  schedule: TreatmentSchedule,
  action: DoseAction,
  today: string,
): TreatmentSchedule | null {
  let count = 0
  try {
    const { writes } = doseChange(history, schedule, action, () => `apercu-${(count += 1)}`)
    return treatmentScheduleOf({ ...history, doses: dosesAfter(history.doses, writes) }, today)
  } catch (cause) {
    if (cause instanceof RangeError) return null
    throw cause
  }
}

/** Journées encore à donner de la période après ce jour, jusqu'à la date de fin s'il y en a une. */
export function pendingDaysAfter(
  schedule: Pick<TreatmentSchedule, 'currentDoses' | 'upcoming'>,
  period: Pick<TreatmentPeriodRecord, 'id' | 'endsOn' | 'times'>,
  day: string,
): string[] {
  const perDay = Math.max(1, period.times.length)
  const limit = period.endsOn === null ? (SHOWN_DAYS + 2) * perDay : 5000
  const days = [...schedule.currentDoses, ...schedule.upcoming(limit)]
    .filter((due) => due.periodId === period.id && due.dueOn > day)
    .map(({ dueOn }) => dueOn)
  return [...new Set(days)].sort()
}

/**
 * Doses qu'un geste fait sortir de la période à cause de sa date de fin (Q4) : les dernières de
 * l'ancien calendrier, quand le nouveau en compte moins après la dose déplacée.
 */
export function lostDays(
  before: string[],
  after: string[],
  period: Pick<TreatmentPeriodRecord, 'endsOn'>,
): string[] {
  if (period.endsOn === null || after.length >= before.length) return []
  return before.slice(after.length - before.length)
}

/** L'aide sous la case : où vont les doses suivantes, ou la dose perdue par la date de fin. */
export function shiftHelpText(
  t: Translate,
  period: Pick<TreatmentPeriodRecord, 'frequency'>,
  {
    shifts,
    following,
    lost,
    weekdayOn = null,
    arrivals = [],
  }: {
    shifts: boolean
    following: string[]
    lost: string[]
    /** Le jour qui nomme le rythme : l'ancrage du décalage, sinon une dose qui n'est pas un report. */
    weekdayOn?: string | null
    /** Jours d'arrivée des reports : une dose reportée est nommée à part. */
    arrivals?: readonly string[]
  },
  today: string,
): ShiftHelp | null {
  if (shifts && lost.length > 0) {
    const dates = formatDaySeries(lost)
    return { text: t('treatments.shift.lost', { dates }, lost.length), warning: true }
  }
  const shown = following.slice(0, SHOWN_DAYS)
  const [first] = shown
  if (first === undefined) return null
  const way = shifts ? 'moved' : 'kept'
  const { unit, value } = period.frequency
  const [, second] = shown
  const every = t(`treatments.sheet.frequency.${unit}`, { n: value }, value)
  const day = (date: string) => formatDayMonthOrYear(date, today)
  if (second !== undefined && arrivals.includes(first)) {
    const named = { report: day(first), date: day(second), every }
    const text = shifts
      ? t('treatments.shift.movedAfterReport', named)
      : t('treatments.shift.keptAfterReport', named)
    return { text, warning: false }
  }
  if (second !== undefined && arrivals.includes(second)) {
    const named = { date: day(first), report: withoutFinalDot(day(second)) }
    const text = shifts
      ? t('treatments.shift.movedBeforeReport', named)
      : t('treatments.shift.keptBeforeReport', named)
    return { text, warning: false }
  }
  const weekday = formatWeekday(weekdayOn ?? first)
  if (unit === 'week' && shown.every((day) => formatWeekday(day) === weekday)) {
    const named = { weekday, dates: withoutFinalDot(formatDaySeries(shown)) }
    return { text: t(`treatments.shift.${way}.weekly`, named), warning: false }
  }
  const date = formatDayMonthOrYear(first, today)
  return { text: t(`treatments.shift.${way}.every`, { date, every }), warning: false }
}

type GestureHelp = {
  action: DoseAction
  periodId: string
  currentDay: string
  newDay: string
  shifts: boolean
  today: string
}

// La phrase des doses suivantes nomme un report : « Dose reportée le … ».
function namesReport(
  { shifts, following, lost }: { shifts: boolean; following: string[]; lost: string[] },
  arrivals: ReadonlySet<string>,
): boolean {
  if (shifts && lost.length > 0) return false
  const [first, second] = following
  return second !== undefined && (arrivals.has(first!) || arrivals.has(second))
}

function revealedHelpText(
  t: Translate,
  schedule: TreatmentSchedule,
  after: TreatmentSchedule,
  today: string,
): string | null {
  return revealedDuesText(t, revealedDues(schedule, after, today), 'help')
}

function suiteHelpOf(
  t: Translate,
  history: History,
  schedule: TreatmentSchedule,
  { action, periodId, currentDay, newDay, shifts, today }: GestureHelp,
): { help: ShiftHelp | null; namesReport: boolean } {
  const period = history.periods.find(({ id }) => id === periodId)
  const after = scheduleAfter(history, schedule, action, today)
  if (period === undefined || after === null) return { help: null, namesReport: false }
  const pending = pendingDaysAfter(after, period, newDay)
  const lost = lostDays(pendingDaysAfter(schedule, period, currentDay), pending, period)
  const following = pending.filter((day) => day >= today)
  const arrivals = new Set(
    after.doses
      .filter((dose) => dose.status === 'postponed' && dose.periodId === periodId)
      .map(({ nextDueDate }) => nextDueDate),
  )
  const weekdayOn = shifts ? newDay : (following.find((day) => !arrivals.has(day)) ?? null)
  const help = shiftHelpText(
    t,
    period,
    { shifts, following, lost, weekdayOn, arrivals: [...arrivals] },
    today,
  )
  const named = namesReport({ shifts, following, lost }, arrivals)
  const revealed = revealedHelpText(t, schedule, after, today)
  if (revealed === null) return { help, namesReport: named }
  const text = help === null ? revealed : `${help.text} ${revealed}`
  return { help: { text, warning: help?.warning ?? false }, namesReport: named }
}

/**
 * L'aide d'un geste de la fiche, calculée sur le calendrier qu'il laisserait : `currentDay`, le jour
 * de la dose avant le geste ; `newDay`, après.
 */
function shiftHelpOf(
  t: Translate,
  history: History,
  schedule: TreatmentSchedule,
  gesture: GestureHelp,
): ShiftHelp | null {
  return suiteHelpOf(t, history, schedule, gesture).help
}

type Line = Pick<
  NewTreatmentDose,
  'id' | 'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'nextDueDate'
>

type Carnet = { history: History; schedule: TreatmentSchedule; today: string }

/** La case de « Changer la date » d'une prise ou d'un report. */
export type DateChangeBox = {
  /** N2 : cochée quand l'échéance a une ligne de décalage. */
  initial: boolean
  /** Dernier jour d'un report seul (Q2 a) ; `null` : pas d'autre borne que la date de fin. */
  aloneMax: string | null
  view(date: string | null, shifts: boolean): ShiftBoxView
  /** Jours grisés : ils feraient passer la dose suivante à un report seul (Q2 a). */
  refusedDays(shifts: boolean): string[]
}

// Les jours que la correction peut viser sans parcourir des années d'historique.
const REFUSAL_WINDOW_DAYS = 62

function passesMoveHelp(
  t: Translate,
  passedOn: string,
  today: string,
  canUncheck = false,
): ShiftHelp {
  const date = formatDayMonthOrYear(passedOn, today)
  const text = canUncheck
    ? t('treatments.shift.passesMoveUncheck', { date })
    : t('treatments.shift.passesMove', { date })
  return { text, warning: true }
}

function stuckMoveHelp(t: Translate, movedOn: string, today: string): ShiftHelp {
  const date = formatDayMonthOrYear(movedOn, today)
  return { text: t('treatments.shift.stuckMove', { date }), warning: true }
}

// Refusé case décochée alors que cocher la case suffirait.
function passesMoveCheckHelp(t: Translate, movedOn: string, today: string): ShiftHelp {
  const date = formatDayMonthOrYear(movedOn, today)
  return { text: t('treatments.shift.passesMoveCheck', { date }), warning: true }
}

// I2 : la correction fait suivre ce report seul ; sa date d'arrivée d'avant.
function followedReportOn(
  history: History,
  schedule: TreatmentSchedule,
  doseId: string,
  date: string,
  shifts: boolean,
): string | null {
  const { postponement } = schedule.redate(doseId, date, shifts)
  if (postponement === null) return null
  const follows = postponement.kept ? postponement.followed === true : postponement.followedOn
  if (follows === undefined || follows === false) return null
  const [movedId] = postponement.doseIds
  return history.doses.find(({ id }) => id === movedId)?.nextDueDate ?? null
}

function daysUpTo(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) =>
    format(subDays(parseISO(today), index), 'yyyy-MM-dd'),
  )
}

function hasShiftLine(history: History, { periodId, dueOn }: Pick<Line, 'periodId' | 'dueOn'>) {
  return history.doses.some(
    (dose) => dose.status === 'shift' && dose.periodId === periodId && dose.dueOn === dueOn,
  )
}

function laterOf(a: string, b: string): string {
  return a > b ? a : b
}

/** `null` : pas de case pour cette ligne (prise en plus, oubli, report qui ne peut aller seul). */
export function dateChangeBox(
  t: Translate,
  line: Line,
  { history, schedule, today }: Carnet,
  action: (date: string, shifts: boolean) => DoseAction,
): DateChangeBox | null {
  const suiteOf = (date: string, shifts: boolean, currentDay: string, newDay: string) =>
    suiteHelpOf(t, history, schedule, {
      action: action(date, shifts),
      periodId: line.periodId,
      currentDay,
      newDay,
      shifts,
      today,
    })
  const help = (date: string, shifts: boolean, currentDay: string, newDay: string) =>
    suiteOf(date, shifts, currentDay, newDay).help
  if (line.status === 'postponed') {
    const due = { periodId: line.periodId, dueOn: line.nextDueDate, dueTime: line.dueTime }
    const alone = schedule.moveBounds(due, false)
    if (alone === null) return null
    const aloneMax = alone.latest
    return {
      initial: hasShiftLine(history, line),
      aloneMax,
      refusedDays: () => [],
      view: (date, shifts) => {
        if (date === null || date === line.nextDueDate) return { shown: true, help: null }
        if (!shifts && aloneMax !== null && date > aloneMax) {
          const text = t('treatments.shift.aloneLatest', {
            date: withoutFinalDot(formatDayMonthOrYear(aloneMax, today)),
          })
          return { shown: true, help: { text, warning: true }, blocked: true }
        }
        return { shown: true, help: help(date, shifts, line.nextDueDate, date) }
      },
    }
  }
  if (line.status !== 'given' || line.givenOn === null) return null
  const givenOn = line.givenOn
  return {
    initial: hasShiftLine(history, schedule.shiftDueOf(line)),
    aloneMax: null,
    refusedDays: (shifts) => {
      const { lastExtraDay } = schedule.redateLimits(line.id)
      return daysUpTo(today, REFUSAL_WINDOW_DAYS).filter(
        (day) =>
          day !== givenOn &&
          (lastExtraDay === null || day > lastExtraDay) &&
          schedule.redateRefusal(line.id, day, shifts) !== null,
      )
    },
    view: (date, shifts) => {
      if (date === null || date === givenOn) return { shown: false, help: null }
      const shown = schedule.redateOffersShift(line.id, date)
      const refusal = schedule.redateRefusal(line.id, date, shifts)
      if (refusal !== null) {
        const refused =
          refusal.reason === 'stuck'
            ? stuckMoveHelp(t, refusal.on, today)
            : !shifts && shown
              ? passesMoveCheckHelp(t, refusal.on, today)
              : passesMoveHelp(t, refusal.on, today)
        return { shown, help: refused, blocked: true }
      }
      const follows = followedReportOn(history, schedule, line.id, date, shifts)
      const suite = shown ? suiteOf(date, shifts, line.dueOn, laterOf(line.dueOn, date)) : null
      const after = shown ? null : scheduleAfter(history, schedule, action(date, true), today)
      const first = suite?.help?.text ?? (after && revealedHelpText(t, schedule, after, today))
      const sentence =
        follows === null || suite?.namesReport === true
          ? null
          : t('treatments.shift.reportFollows', { date: formatDayMonthOrYear(follows, today) })
      const text = [first, sentence].filter((part) => part !== null && part !== undefined)
      if (text.length === 0) return { shown, help: null }
      return { shown, help: { text: text.join(' '), warning: suite?.help?.warning ?? false } }
    },
  }
}

/** La case de « Fait à une autre date » (Q3) : jamais pour une dose non renseignée (N1). */
export function otherDateBox(
  t: Translate,
  due: Due | null,
  givenOn: string | null,
  { history, schedule, today }: Carnet,
  shifts: boolean,
): ShiftBoxView {
  if (due === null || givenOn === null || !schedule.offersShift(due, givenOn)) {
    return { shown: false, help: null }
  }
  const passedOn = shifts ? schedule.noteRefusal(due, givenOn) : null
  if (passedOn !== null) {
    return { shown: true, help: passesMoveHelp(t, passedOn, today, true), blocked: true }
  }
  const gesture = { kind: 'given' as const, due, givenOn, shiftsFollowing: shifts }
  return {
    shown: true,
    help: shiftHelpOf(t, history, schedule, {
      action: { kind: 'note', gesture },
      periodId: due.periodId,
      currentDay: due.dueOn,
      newDay: laterOf(due.dueOn, givenOn),
      shifts,
      today,
    }),
  }
}

/**
 * « C'est fait » aujourd'hui : `confirm` quand la prise pourrait décaler la suite, la case est alors
 * demandée ; sinon la prise seule, d'un tap. Un report seul qui bloque le décalage (Q2 a) reste un tap.
 */
export function doneGesture(
  schedule: Pick<TreatmentSchedule, 'offersShift' | 'noteRefusal'>,
  due: Due,
  today: string,
): { confirm: true } | { confirm: false; gesture: DoseGesture } {
  if (schedule.offersShift(due, today) && schedule.noteRefusal(due, today) === null) {
    return { confirm: true }
  }
  return { confirm: false, gesture: { kind: 'given', due, givenOn: today } }
}

/**
 * Ce que « Fait à une autre date » enregistre : `null` sans dose ou quand le geste est refusé ; la
 * case montrée, son état part au moteur, qui refuse un décalage impossible au lieu de l'omettre.
 */
export function otherDateNote(
  due: Due | null,
  givenOn: string | null,
  view: ShiftBoxView,
  shifts: boolean,
): DoseGesture | null {
  if (due === null || givenOn === null || view.blocked === true) return null
  return view.shown
    ? { kind: 'given', due, givenOn, shiftsFollowing: shifts }
    : { kind: 'given', due, givenOn }
}

/** « Dose du vendredi 16 oct., donnée le lundi 19 oct. » ; `null` quand la prise est à son jour. */
export function otherDateRecap(
  t: Translate,
  due: Due | null,
  givenOn: string | null,
  severalTimes: boolean,
): string | null {
  if (due === null || givenOn === null || givenOn === due.dueOn) return null
  const dates = { due: formatWeekdayDayMonth(due.dueOn), given: formatWeekdayDayMonth(givenOn) }
  return severalTimes && due.dueTime !== null
    ? t('treatments.shift.recapAt', { ...dates, time: formatClockTime(due.dueTime) })
    : t('treatments.shift.recap', dates)
}

/** Ce que dit le toast de « Supprimer ce décalage » ; `null` pour tout autre geste. */
export function restoredSuiteFor(
  history: History,
  action: DoseAction,
  today: string,
): { nextOn: string | null; weekly: boolean } | null {
  if (action.kind !== 'remove-shift') return null
  const line = history.doses.find(({ id }) => id === action.doseId)
  return line === undefined ? null : restoredSuiteOf(history, line, today)
}

/** Après « Supprimer ce décalage » : la prochaine dose du calendrier sans lui. */
function restoredSuiteOf(
  history: History,
  line: Line,
  today: string,
): { nextOn: string | null; weekly: boolean } {
  const period = history.periods.find(({ id }) => id === line.periodId)
  if (period === undefined) return { nextOn: null, weekly: false }
  const doses = history.doses.filter(({ id }) => id !== line.id)
  const schedule = treatmentScheduleOf({ ...history, doses }, today)
  // Les doses suivantes viennent après la dose déplacée elle-même.
  const report = doses.find(
    (dose) =>
      dose.status === 'postponed' && dose.periodId === line.periodId && dose.dueOn === line.dueOn,
  )
  const after = laterOf(line.dueOn, report?.nextDueDate ?? line.dueOn)
  return {
    nextOn: pendingDaysAfter(schedule, period, after)[0] ?? null,
    weekly: period.frequency.unit === 'week',
  }
}
