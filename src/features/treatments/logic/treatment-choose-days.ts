import { getDay, getDaysInMonth, parseISO } from 'date-fns'

import type { DoseGesture, Due } from '@/shared/domain/treatment-schedule'
import {
  formatClockTime,
  formatFullDayMonth,
  formatFullMonthYear,
  weekdayInitials,
  weekStartsOn,
} from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

/** Les cases décochées, par `dayKey` : tout le reste est coché. */
export type Unchecked = ReadonlySet<string>

export type DayChoice = { given: Due[]; missed: Due[] }

export type ChooseDaysCell =
  { day: number; due: null } | { day: number; due: Due; key: string; date: string }

export type ChooseDaysMonth = {
  id: string
  title: string
  count: string
  /** Cases vides avant le 1er, pour le poser sous son jour de semaine. */
  blanks: number
  cells: ChooseDaysCell[]
  dues: Due[]
}

export type ChooseDaysTab = {
  id: string
  title: string
  /** Heure de l'onglet, telle qu'elle s'écrit ; `null` pour des doses sans heure. */
  time: string | null
  dues: Due[]
}

/** Ce qui ne dépend que des doses : les cases cochées n'y changent rien. */
export type ChooseDaysLayout = {
  hasTabs: boolean
  tabs: ChooseDaysTab[]
  help: string
  weekdays: string[]
}

export type ChooseDaysTabTexts = {
  state: string
  label: string
  checkAllLabel: string
  uncheckAllLabel: string
}

export function dayKey({ periodId, dueOn, dueTime }: Due): string {
  return `${periodId} ${dueOn} ${dueTime ?? ''}`
}

export function toggleDay(unchecked: Set<string>, due: Due): void {
  if (!unchecked.delete(dayKey(due))) unchecked.add(dayKey(due))
}

export function setDays(unchecked: Set<string>, dues: readonly Due[], checked: boolean): void {
  for (const due of dues) {
    if (checked) unchecked.delete(dayKey(due))
    else unchecked.add(dayKey(due))
  }
}

export function missedAmong(dues: readonly Due[], unchecked: Unchecked): number {
  let missed = 0
  for (const due of dues) if (unchecked.has(dayKey(due))) missed += 1
  return missed
}

export function choiceOf(dues: readonly Due[], unchecked: Unchecked): DayChoice {
  return {
    given: dues.filter((due) => !unchecked.has(dayKey(due))),
    missed: dues.filter((due) => unchecked.has(dayKey(due))),
  }
}

/** Décocher = oubliée ; une dose cochée est notée donnée le jour de son échéance. */
export function choiceGestures({ given, missed }: DayChoice): DoseGesture[] {
  return [
    ...given.map((due): DoseGesture => ({ kind: 'given', due, givenOn: due.dueOn })),
    ...missed.map((due): DoseGesture => ({ kind: 'missed', due })),
  ]
}

function givenCount(t: Translate, given: number): string {
  return t('treatments.unlogged.days.givenCount', { n: given }, given)
}

function missedCount(t: Translate, missed: number): string {
  return t('treatments.unlogged.days.missedCount', { n: missed }, missed)
}

function counts(t: Translate, given: number, missed: number): string {
  return t('treatments.unlogged.days.counts', {
    given: givenCount(t, given),
    missed: missedCount(t, missed),
  })
}

/** « 25 données », « 20 données, 5 oubliées » : sans la part qui vaut zéro. */
export function choiceSummary(t: Translate, given: number, missed: number): string {
  if (missed === 0) return givenCount(t, given)
  if (given === 0) return missedCount(t, missed)
  return counts(t, given, missed)
}

/** « Métacam · Luna · du 3 au 27 sept. » : sans ce qui n'est pas encore saisi. */
export function chooseDaysSubtitle(...parts: (string | null)[]): string {
  return parts.filter((part) => part !== null && part.trim() !== '').join(' · ')
}

function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const group = groups.get(keyOf(item))
    if (group) group.push(item)
    else groups.set(keyOf(item), [item])
  }
  return groups
}

function monthOf(t: Translate, id: string, dues: Due[], time: string | null): ChooseDaysMonth {
  const first = parseISO(`${id}-01`)
  const byDay = new Map(dues.map((due) => [Number(due.dueOn.slice(8, 10)), due]))
  const days = t('treatments.unlogged.days.monthDays', { n: dues.length }, dues.length)
  return {
    id,
    title: formatFullMonthYear(`${id}-01`),
    count: time === null ? days : t('treatments.unlogged.days.monthDaysAt', { days, time }),
    blanks: (getDay(first) - weekStartsOn() + 7) % 7,
    cells: Array.from({ length: getDaysInMonth(first) }, (_, index): ChooseDaysCell => {
      const day = index + 1
      const due = byDay.get(day)
      if (due === undefined) return { day, due: null }
      const date = formatFullDayMonth(due.dueOn)
      return {
        day,
        due,
        key: dayKey(due),
        date: time === null ? date : t('treatments.unlogged.days.dayAt', { date, time }),
      }
    }),
    dues,
  }
}

/** Les mois d'un onglet, sans ceux qui n'ont aucune dose. */
export function tabMonths(t: Translate, { dues, time }: ChooseDaysTab): ChooseDaysMonth[] {
  const months = groupBy(dues, ({ dueOn }) => dueOn.slice(0, 7))
  return [...months.keys()].sort().map((id) => monthOf(t, id, months.get(id) ?? [], time))
}

/** `date` : celle d'une case, avec son heure quand l'onglet en a une. */
export function dayLabel(t: Translate, date: string, checked: boolean): string {
  return checked
    ? t('treatments.unlogged.days.dayGiven', { date })
    : t('treatments.unlogged.days.dayMissed', { date })
}

/** « Cocher le mois » dès qu'un de ses jours est décoché, « Décocher le mois » sinon. */
export function monthToggle(
  t: Translate,
  { title }: ChooseDaysMonth,
  missed: number,
): { checks: boolean; text: string; label: string } {
  return missed > 0
    ? {
        checks: true,
        text: t('treatments.unlogged.days.checkMonth'),
        label: t('treatments.unlogged.days.checkMonthLabel', { month: title }),
      }
    : {
        checks: false,
        text: t('treatments.unlogged.days.uncheckMonth'),
        label: t('treatments.unlogged.days.uncheckMonthLabel', { month: title }),
      }
}

function allLabels(
  t: Translate,
  { time, dues }: ChooseDaysTab,
  hasTabs: boolean,
): Pick<ChooseDaysTabTexts, 'checkAllLabel' | 'uncheckAllLabel'> {
  const n = dues.length
  if (!hasTabs) {
    return {
      checkAllLabel: t('treatments.unlogged.days.checkAllLabel', { n }, n),
      uncheckAllLabel: t('treatments.unlogged.days.uncheckAllLabel', { n }, n),
    }
  }
  if (time === null) {
    return {
      checkAllLabel: t('treatments.unlogged.days.checkAllLabelNoTime', { n }, n),
      uncheckAllLabel: t('treatments.unlogged.days.uncheckAllLabelNoTime', { n }, n),
    }
  }
  return {
    checkAllLabel: t('treatments.unlogged.days.checkAllLabelAt', { n, time }, n),
    uncheckAllLabel: t('treatments.unlogged.days.uncheckAllLabelAt', { n, time }, n),
  }
}

/** `missed` : le nombre de cases décochées de l'onglet. */
export function tabTexts(
  t: Translate,
  tab: ChooseDaysTab,
  missed: number,
  hasTabs: boolean,
): ChooseDaysTabTexts {
  const missedText = t('treatments.unlogged.days.tab.missed', { n: missed }, missed)
  const state = missed === 0 ? t('treatments.unlogged.days.tab.allGiven') : missedText
  return {
    state: missed === 0 ? t('treatments.unlogged.days.tab.allChecked') : missedText,
    label:
      tab.time === null
        ? t('treatments.unlogged.days.tab.labelNoTime', { state })
        : t('treatments.unlogged.days.tab.label', { time: tab.time, state }),
    ...allLabels(t, tab, hasTabs),
  }
}

/** `when` dit les jours des doses au lecteur d'écran ; `stopping` : le choix arrête aussi le traitement. */
export function submitTexts(
  t: Translate,
  total: number,
  missed: number,
  when: string,
  stopping = false,
): { submit: string; submitLabel: string } {
  const text = counts(t, total - missed, missed)
  return stopping
    ? {
        submit: t('treatments.unlogged.days.submitStop', { counts: text }),
        submitLabel: t('treatments.unlogged.days.submitStopLabel', { counts: text, when }),
      }
    : {
        submit: t('treatments.unlogged.days.submit', { counts: text }),
        submitLabel: t('treatments.unlogged.days.submitLabel', { counts: text, when }),
      }
}

/** Un onglet par heure de prise, les doses sans heure d'abord. */
export function chooseDaysLayout(t: Translate, dues: readonly Due[]): ChooseDaysLayout {
  const byTime = groupBy(dues, ({ dueTime }) => dueTime ?? '')
  const hasTabs = byTime.size > 1
  return {
    hasTabs,
    tabs: [...byTime.keys()].sort().map((id) => {
      const time = id === '' ? null : formatClockTime(id)
      return {
        id,
        title: time ?? t('treatments.unlogged.days.noTime'),
        time,
        dues: byTime.get(id) ?? [],
      }
    }),
    help: hasTabs ? t('treatments.unlogged.days.helpByHour') : t('treatments.unlogged.days.help'),
    weekdays: weekdayInitials(),
  }
}
