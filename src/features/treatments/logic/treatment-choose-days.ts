import { getDay, getDaysInMonth, parseISO } from 'date-fns'

import type { DoseGesture, Due } from '@/shared/domain/treatment-schedule'
import {
  formatClockTime,
  formatFullDayMonth,
  formatFullMonthYear,
  weekdayInitials,
  weekStartsOn,
} from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

/** Les cases décochées, par `dayKey` : tout le reste est coché. */
export type Unchecked = ReadonlySet<string>

export type DayChoice = { given: Due[]; missed: Due[] }

export type ChooseDaysCell =
  | { day: number; due: null }
  | { day: number; due: Due; key: string; checked: boolean; label: string }

export type ChooseDaysMonth = {
  id: string
  title: string
  count: string
  /** Cases vides avant le 1er, pour le poser sous son jour de semaine. */
  blanks: number
  cells: ChooseDaysCell[]
  dues: Due[]
  /** `null` quand le calendrier n'a qu'un mois : « Tout cocher / Tout décocher » suffit. */
  toggle: { checks: boolean; text: string; label: string } | null
}

export type ChooseDaysTab = {
  id: string
  title: string
  state: string
  label: string
  dues: Due[]
  months: ChooseDaysMonth[]
  checkAllLabel: string
  uncheckAllLabel: string
}

export type ChooseDays = {
  hasTabs: boolean
  tabs: ChooseDaysTab[]
  help: string
  weekdays: string[]
  submit: string
  submitLabel: string
}

export function dayKey({ periodId, dueOn, dueTime }: Due): string {
  return `${periodId} ${dueOn} ${dueTime ?? ''}`
}

export function toggledDay(unchecked: Unchecked, due: Due): Set<string> {
  const next = new Set(unchecked)
  if (!next.delete(dayKey(due))) next.add(dayKey(due))
  return next
}

export function withDays(
  unchecked: Unchecked,
  dues: readonly Due[],
  checked: boolean,
): Set<string> {
  const next = new Set(unchecked)
  for (const due of dues) {
    if (checked) next.delete(dayKey(due))
    else next.add(dayKey(due))
  }
  return next
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
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item])
  return groups
}

function monthOf(
  t: Translate,
  id: string,
  dues: Due[],
  unchecked: Unchecked,
  time: string | null,
  alone: boolean,
): ChooseDaysMonth {
  const first = parseISO(`${id}-01`)
  const title = formatFullMonthYear(`${id}-01`)
  const byDay = new Map(dues.map((due) => [Number(due.dueOn.slice(8, 10)), due]))
  const cells = Array.from({ length: getDaysInMonth(first) }, (_, index): ChooseDaysCell => {
    const day = index + 1
    const due = byDay.get(day)
    if (due === undefined) return { day, due: null }
    const checked = !unchecked.has(dayKey(due))
    const date =
      time === null
        ? formatFullDayMonth(due.dueOn)
        : t('treatments.unlogged.days.dayAt', { date: formatFullDayMonth(due.dueOn), time })
    return {
      day,
      due,
      key: dayKey(due),
      checked,
      label: checked
        ? t('treatments.unlogged.days.dayGiven', { date })
        : t('treatments.unlogged.days.dayMissed', { date }),
    }
  })
  const days = t('treatments.unlogged.days.monthDays', { n: dues.length }, dues.length)
  const checks = dues.some((due) => unchecked.has(dayKey(due)))
  return {
    id,
    title,
    count: time === null ? days : t('treatments.unlogged.days.monthDaysAt', { days, time }),
    blanks: (getDay(first) - weekStartsOn() + 7) % 7,
    cells,
    dues,
    toggle: alone
      ? null
      : checks
        ? {
            checks,
            text: t('treatments.unlogged.days.checkMonth'),
            label: t('treatments.unlogged.days.checkMonthLabel', { month: title }),
          }
        : {
            checks,
            text: t('treatments.unlogged.days.uncheckMonth'),
            label: t('treatments.unlogged.days.uncheckMonthLabel', { month: title }),
          },
  }
}

function tabOf(
  t: Translate,
  id: string,
  dues: Due[],
  unchecked: Unchecked,
  hasTabs: boolean,
): ChooseDaysTab {
  const time = id === '' ? null : formatClockTime(id)
  const title = time ?? t('treatments.unlogged.days.noTime')
  const missed = dues.filter((due) => unchecked.has(dayKey(due))).length
  const months = groupBy(dues, ({ dueOn }) => dueOn.slice(0, 7))
  const n = dues.length
  const shownTime = hasTabs ? title : null
  return {
    id,
    title,
    state:
      missed === 0
        ? t('treatments.unlogged.days.tab.allChecked')
        : t('treatments.unlogged.days.tab.missed', { n: missed }, missed),
    label: t('treatments.unlogged.days.tab.label', {
      time: title,
      state:
        missed === 0
          ? t('treatments.unlogged.days.tab.allGiven')
          : t('treatments.unlogged.days.tab.missed', { n: missed }, missed),
    }),
    dues,
    months: [...months.keys()]
      .sort()
      .map((month) =>
        monthOf(t, month, months.get(month) ?? [], unchecked, time, months.size === 1),
      ),
    checkAllLabel:
      shownTime === null
        ? t('treatments.unlogged.days.checkAllLabel', { n }, n)
        : t('treatments.unlogged.days.checkAllLabelAt', { n, time: shownTime }, n),
    uncheckAllLabel:
      shownTime === null
        ? t('treatments.unlogged.days.uncheckAllLabel', { n }, n)
        : t('treatments.unlogged.days.uncheckAllLabelAt', { n, time: shownTime }, n),
  }
}

/** Un calendrier par heure de prise, mois par mois ; `when` dit la plage des doses au lecteur d'écran. */
export function chooseDays(
  t: Translate,
  dues: readonly Due[],
  unchecked: Unchecked,
  when: string,
): ChooseDays {
  const byTime = groupBy(dues, ({ dueTime }) => dueTime ?? '')
  const hasTabs = byTime.size > 1
  const { given, missed } = choiceOf(dues, unchecked)
  return {
    hasTabs,
    tabs: [...byTime.keys()]
      .sort()
      .map((time) => tabOf(t, time, byTime.get(time) ?? [], unchecked, hasTabs)),
    help: hasTabs ? t('treatments.unlogged.days.helpByHour') : t('treatments.unlogged.days.help'),
    weekdays: weekdayInitials(),
    submit: t('treatments.unlogged.days.submit', {
      counts: counts(t, given.length, missed.length),
    }),
    submitLabel: t('treatments.unlogged.days.submitLabel', {
      given: given.length,
      missed: missed.length,
      when,
    }),
  }
}
