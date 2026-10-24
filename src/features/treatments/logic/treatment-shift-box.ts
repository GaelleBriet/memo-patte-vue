import { parseISO, subDays } from 'date-fns'

import { keepsShift, type NoteGesture } from './treatment-dose-change'
import type { NextDoseShift } from './treatment-edition-resolution'
import {
  laterOf,
  refusalHelp,
  suiteHelpOf,
  type Carnet,
  type ShiftHelp,
} from './treatment-shift-help'
import { revealedDues, revealedDuesText } from './treatment-revealed-dues'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import { toDay } from '@/shared/domain/calendar-day'
import {
  applied,
  moveBounds,
  play,
  treatmentView,
  type Due,
  type ExtraAnswer,
  type Gesture,
  type GestureOutcome,
  type Refusal,
} from '@/shared/domain/dose-calendar'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'
import {
  formatClockTime,
  formatDayMonthOrYear,
  formatWeekdayDayMonth,
  withoutFinalDot,
} from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export type { ShiftHelp }

/** Ce que la case montre pour la date et l'état choisis ; `shown` faux : pas de case pour ce jour. */
export type ShiftBoxView = {
  shown: boolean
  help: ShiftHelp | null
  /** À ce jour, le geste est refusé avec cet état de la case. */
  blocked?: boolean
}

// Les jours que la correction peut viser sans parcourir des années d'historique.
const REFUSAL_WINDOW_DAYS = 62

type Line = Pick<
  TreatmentDose,
  'id' | 'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'targetOn'
>

/** La case de « Changer la date » d'une prise ou d'un report. */
export type DateChangeBox = {
  /** N2 : cochée quand l'échéance a une ligne de décalage. */
  initial: boolean
  /** Dernier jour d'un report seul (Q2 a) ; `null` : pas d'autre borne que la date de fin. */
  aloneMax: string | null
  /** `answer` : la réponse à « Cette prise » d'une prise en plus ; la case ne vient qu'avec « Remplace ». */
  view(date: string | null, shifts: boolean, answer?: ExtraAnswer | null): ShiftBoxView
  /** Jours grisés : le moteur refuse la correction à ces jours. */
  refusedDays(shifts: boolean): string[]
}

function daysUpTo(today: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => toDay(subDays(parseISO(today), index)))
}

const refused = (result: { refusal: Refusal } | GestureOutcome): result is { refusal: Refusal } =>
  'refusal' in result

function movedDueOf(line: Pick<Line, 'periodId' | 'dueOn' | 'dueTime' | 'targetOn'>): Due {
  return { settingId: line.periodId, dueOn: line.targetOn ?? line.dueOn, dueTime: line.dueTime }
}

function moveBoxFor(
  t: Translate,
  due: Due,
  carnet: Carnet,
  initial: boolean,
): DateChangeBox | null {
  const { reading, today } = carnet
  const alone = moveBounds(reading.input, due, false)
  if ('refusal' in alone) return null
  const aloneMax = alone.latest
  return {
    initial,
    aloneMax,
    refusedDays: () => [],
    view: (date, shifts) => {
      if (date === null || date === due.dueOn) return { shown: true, help: null }
      if (!shifts && aloneMax !== null && date > aloneMax) {
        const text = t('treatments.shift.aloneLatest', {
          date: withoutFinalDot(formatDayMonthOrYear(aloneMax, today)),
        })
        return { shown: true, help: { text, warning: true }, blocked: true }
      }
      const result = play(reading.input, { kind: 'move', due, to: date, shiftsFollowing: shifts })
      if (refused(result))
        return { shown: true, help: refusalHelp(t, result.refusal, today), blocked: true }
      const outcome = { outcome: result, settingId: due.settingId, newDay: date, shifts }
      return { shown: true, help: suiteHelpOf(t, carnet, outcome).help }
    },
  }
}

function moveBox(t: Translate, line: Line, carnet: Carnet): DateChangeBox | null {
  return moveBoxFor(t, movedDueOf(line), carnet, keepsShift(carnet.reading, line))
}

/** La case de « Prochaine dose » dans « Modifier », pour la date choisie et l'état de la case. */
export function nextDoseBoxView(
  t: Translate,
  { due, chosenOn, carnet }: NextDoseShift,
  shifts: boolean,
): ShiftBoxView {
  return moveBoxFor(t, due, carnet, true)?.view(chosenOn, shifts) ?? { shown: false, help: null }
}

function redateBox(t: Translate, line: Line, carnet: Carnet): DateChangeBox | null {
  const { reading, today } = carnet
  const givenOn = line.givenOn
  if ((line.status !== 'given' && line.status !== 'extra') || givenOn === null) return null
  const redate = (date: string, shifts: boolean, answer?: ExtraAnswer | null): Gesture => ({
    kind: 'redate',
    lineId: line.id,
    givenOn: date,
    shiftsFollowing: shifts,
    ...(answer === undefined || answer === null ? {} : { answer }),
  })
  return {
    initial: keepsShift(reading, line),
    aloneMax: null,
    refusedDays: (shifts) =>
      daysUpTo(today, REFUSAL_WINDOW_DAYS).filter(
        (day) => day !== givenOn && refused(play(reading.input, redate(day, shifts))),
      ),
    view: (date, shifts, answer) => {
      if (date === null || date === givenOn || (line.status === 'extra' && answer !== 'replaces')) {
        return { shown: false, help: null }
      }
      const plain = play(reading.input, redate(date, false, answer))
      if (refused(plain)) {
        return { shown: false, help: refusalHelp(t, plain.refusal, today), blocked: true }
      }
      const shown = plain.offersShift
      const result = shown && shifts ? play(reading.input, redate(date, true, answer)) : plain
      if (refused(result)) {
        return { shown, help: refusalHelp(t, result.refusal, today), blocked: true }
      }
      const suite = shown
        ? suiteHelpOf(t, carnet, {
            outcome: result,
            settingId: line.periodId,
            newDay: laterOf(line.dueOn, date),
            shifts,
          })
        : null
      const revealed = shown
        ? null
        : revealedDuesText(
            t,
            revealedDues(
              reading.view,
              treatmentView(applied(reading.input, result.changes)),
              today,
            ),
            'help',
          )
      const [follow] = result.followed
      const sentence =
        follow === undefined || follow.to === null || suite?.namesReport === true
          ? null
          : t('treatments.shift.reportFollows', {
              date: formatDayMonthOrYear(follow.from, today),
            })
      const text = [suite?.help?.text ?? revealed, sentence].filter((part) => part !== null)
      if (text.length === 0) return { shown, help: null }
      return { shown, help: { text: text.join(' '), warning: suite?.help?.warning ?? false } }
    },
  }
}

/** `null` : pas de case pour cette ligne (oubli, report qui ne peut aller seul). */
export function dateChangeBox(t: Translate, line: Line, carnet: Carnet): DateChangeBox | null {
  return line.status === 'postponed' ? moveBox(t, line, carnet) : redateBox(t, line, carnet)
}

/**
 * La case de « Fait à une autre date » (Q3) : jamais pour une dose non renseignée (N1) ; avec
 * « Cette prise », seulement quand la réponse est « Remplace » (R5, Q27).
 */
export function otherDateBox(
  t: Translate,
  due: Due | null,
  givenOn: string | null,
  carnet: Carnet,
  shifts: boolean,
  answer?: ExtraAnswer | null,
): ShiftBoxView {
  if (due === null || givenOn === null || answer === null) return { shown: false, help: null }
  const { reading, today } = carnet
  const note = (shiftsFollowing: boolean): Gesture => ({
    kind: 'note',
    due,
    status: 'given',
    givenOn,
    shiftsFollowing,
    ...(answer === undefined ? {} : { answer }),
  })
  const plain = play(reading.input, note(false))
  if (refused(plain)) {
    return { shown: false, help: refusalHelp(t, plain.refusal, today), blocked: true }
  }
  if (!plain.offersShift) return { shown: false, help: null }
  const result = shifts ? play(reading.input, note(true)) : plain
  if (refused(result)) {
    return { shown: true, help: refusalHelp(t, result.refusal, today), blocked: true }
  }
  const outcome = {
    outcome: result,
    settingId: due.settingId,
    newDay: laterOf(due.dueOn, givenOn),
    shifts,
  }
  return { shown: true, help: suiteHelpOf(t, carnet, outcome).help }
}

/**
 * « C'est fait » aujourd'hui : `confirm` quand la prise pourrait décaler la suite, la case est alors
 * demandée ; sinon la prise seule, d'un tap. Un report seul qui bloque le décalage (Q2 a) reste un tap.
 */
export function doneGesture(
  reading: TreatmentReading,
  due: Due,
  today: string,
): { confirm: true } | { confirm: false; gesture: NoteGesture; heldBy?: string } {
  const note = (shiftsFollowing: boolean): NoteGesture => ({
    kind: 'note',
    due,
    status: 'given',
    givenOn: today,
    shiftsFollowing,
  })
  const plain = play(reading.input, note(false))
  if (refused(plain) || !plain.offersShift) return { confirm: false, gesture: note(false) }
  const shifted = play(reading.input, note(true))
  if (!refused(shifted)) return { confirm: true }
  const held = 'on' in shifted.refusal ? { heldBy: shifted.refusal.on } : {}
  return { confirm: false, gesture: note(false), ...held }
}

/**
 * Ce que « Fait à une autre date » enregistre : `null` sans dose, quand le geste est refusé ou quand
 * « Cette prise » attend sa réponse (`answer` `null`) ; la case montrée, son état part au moteur, qui
 * refuse un décalage impossible au lieu de l'omettre.
 */
export function otherDateNote(
  due: Due | null,
  givenOn: string | null,
  view: ShiftBoxView,
  shifts: boolean,
  answer?: ExtraAnswer | null,
): NoteGesture | null {
  if (due === null || givenOn === null || view.blocked === true || answer === null) return null
  return {
    kind: 'note',
    due,
    status: 'given',
    givenOn,
    shiftsFollowing: view.shown ? shifts : false,
    ...(answer === undefined ? {} : { answer }),
  }
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
