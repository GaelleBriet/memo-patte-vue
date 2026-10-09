import { format, parseISO } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'

import { currentLocale } from '@/core/i18n'

const DATE_LOCALES = { fr, en: enUS }

const MINUS = '−'

const NBSP = '\u00a0'

function formatDate(isoDate: string, pattern: string): string {
  const locale = DATE_LOCALES[currentLocale()]
  return format(parseISO(isoDate), pattern, { locale }).replaceAll(' ', NBSP)
}

function roundToDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

const NUMBER_STYLES = {
  weight: { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false },
  axis: { maximumFractionDigits: 1, useGrouping: false },
  quantity: { maximumFractionDigits: 20, useGrouping: false },
} satisfies Record<string, Intl.NumberFormatOptions>

const numberFormats = new Map<string, Intl.NumberFormat>()

// Construire un `Intl.NumberFormat` coûte bien plus que formater : un seul par langue et par style.
function numberFormat(style: keyof typeof NUMBER_STYLES): Intl.NumberFormat {
  const locale = currentLocale()
  const key = `${locale} ${style}`
  let formatter = numberFormats.get(key)
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat(locale, NUMBER_STYLES[style])
    numberFormats.set(key, formatter)
  }
  return formatter
}

/** Un poids déjà dans son unité, à une décimale au séparateur de la langue : `24,5`, `24.5`. */
export function formatWeight(value: number): string {
  return numberFormat('weight').format(roundToDecimal(value))
}

/** Graduation d'un axe : `24`, `24,5` en français, `24.5` en anglais. */
export function formatWeightAxis(value: number): string {
  return numberFormat('axis').format(roundToDecimal(value))
}

/** Un nombre tel que saisi, au séparateur de la langue : `0,3`, `0.3`. */
export function formatQuantity(value: number): string {
  return numberFormat('quantity').format(value)
}

/** Poids à corriger dans un champ : `24,55` tel que proposé, sans l'arrondi de l'affichage. */
export function formatWeightInput(value: number): string {
  return formatQuantity(value)
}

/** `+0,5`, `−0,3`, ou `±0,0` quand rien ne bouge à la décimale près. */
export function formatWeightDelta(delta: number): string {
  const rounded = roundToDecimal(delta)
  if (rounded === 0) return `±${formatWeight(0)}`
  return `${rounded > 0 ? '+' : MINUS}${formatWeight(Math.abs(rounded))}`
}

/** `Juin`, `Juil.`, `Sept.` / `Jun`, `Jul`, `Sep` — libellés sous une courbe. */
export function formatMonthShort(isoDate: string): string {
  const locale = currentLocale()
  const month = format(parseISO(isoDate), 'MMM', { locale: DATE_LOCALES[locale] })
  return month.charAt(0).toLocaleUpperCase(locale) + month.slice(1)
}

/** `déc. 2026` / `Dec 2026` — mois et année d'une validité. */
export function formatMonthYear(isoDate: string): string {
  return formatDate(isoDate, 'MMM yyyy')
}

/** `septembre 2026` / `September 2026` — titre d'un mois de calendrier. */
export function formatFullMonthYear(isoDate: string): string {
  return formatDate(isoDate, 'LLLL yyyy')
}

/** Premier jour de la semaine dans la langue courante : 1 (lundi) en français, 0 (dimanche) en anglais. */
export function weekStartsOn(): number {
  return DATE_LOCALES[currentLocale()].options?.weekStartsOn ?? 0
}

/** `L M M J V S D` / `S M T W T F S`, dans l'ordre de la semaine de la langue courante. */
export function weekdayInitials(): string[] {
  const locale = DATE_LOCALES[currentLocale()]
  const first = weekStartsOn()
  return Array.from({ length: 7 }, (_, index) =>
    format(new Date(2024, 0, 7 + first + index), 'EEEEE', { locale }).toLocaleUpperCase(),
  )
}

const LONG_DATE_PATTERNS = { fr: 'd MMM yyyy', en: 'PP' }
const DAY_MONTH_PATTERNS = { fr: 'd MMM', en: 'MMM d' }
const FULL_DAY_MONTH_PATTERNS = { fr: 'd MMMM', en: 'MMMM d' }

function isFirstOfMonth(isoDate: string): boolean {
  return isoDate.slice(8, 10) === '01'
}

function formatIn(isoDate: string, patterns: Record<'fr' | 'en', string>): string {
  const locale = currentLocale()
  const pattern =
    locale === 'fr' && isFirstOfMonth(isoDate)
      ? patterns.fr.replace(/\bd\b/, "d'er'")
      : patterns[locale]
  return formatDate(isoDate, pattern)
}

/** `8 nov. 2026`, `1er oct. 2026` / `Nov 8, 2026`. */
export function formatLongDate(isoDate: string): string {
  return formatIn(isoDate, LONG_DATE_PATTERNS)
}

/** `28 sept.` / `Sep 28`. */
export function formatDayMonth(isoDate: string): string {
  return formatIn(isoDate, DAY_MONTH_PATTERNS)
}

/** `28 sept.` dans l'année de `today`, `10 août 2025` sinon. */
export function formatDayMonthOrYear(isoDate: string, today: string): string {
  return isoDate.slice(0, 4) === today.slice(0, 4)
    ? formatDayMonth(isoDate)
    : formatLongDate(isoDate)
}

/** `10 oct` en fin de phrase : le point de l'abréviation sert de point final. */
export function withoutFinalDot(text: string): string {
  return text.endsWith('.') ? text.slice(0, -1) : text
}

/** `28 septembre` / `September 28` — lu par le lecteur d'écran. */
export function formatFullDayMonth(isoDate: string): string {
  return formatIn(isoDate, FULL_DAY_MONTH_PATTERNS)
}

const FULL_DATE_PATTERNS = { fr: 'd MMMM yyyy', en: 'MMMM d, yyyy' }

/** `3 février 2026` / `February 3, 2026` — une date lue par le lecteur d'écran. */
export function formatFullDate(isoDate: string): string {
  return formatIn(isoDate, FULL_DATE_PATTERNS)
}

/** `08/11/2026` / `11/08/2026`. */
export function formatNumericDate(isoDate: string): string {
  return format(parseISO(isoDate), 'P', { locale: DATE_LOCALES[currentLocale()] })
}

/** Heure `HH:mm` : `8 h`, `8 h 30` / `8 am`, `8:30 pm`, espaces insécables. */
export function formatClockTime(time: string): string {
  const hours = Number(time.slice(0, 2))
  const minutes = time.slice(3, 5)
  if (currentLocale() === 'fr') {
    return minutes === '00' ? `${hours}${NBSP}h` : `${hours}${NBSP}h${NBSP}${minutes}`
  }
  const clock = hours % 12 === 0 ? 12 : hours % 12
  const period = hours < 12 ? 'am' : 'pm'
  return `${minutes === '00' ? clock : `${clock}:${minutes}`}${NBSP}${period}`
}

/** `Milo, Luna et Rex` / `Milo, Luna, and Rex`. */
export function formatList(items: readonly string[]): string {
  return new Intl.ListFormat(currentLocale(), { style: 'long', type: 'conjunction' }).format(items)
}

/** `8 h et 20 h` / `8 am and 8 pm`, dans l'ordre de la journée. */
export function formatClockTimes(times: readonly string[]): string {
  return new Intl.ListFormat(currentLocale(), { style: 'long', type: 'conjunction' }).format(
    [...times].sort().map(formatClockTime),
  )
}

function dayNumber(isoDate: string): string {
  if (currentLocale() === 'fr' && isFirstOfMonth(isoDate)) return '1er'
  return String(Number(isoDate.slice(8, 10)))
}

function sameMonth(days: readonly string[]): boolean {
  return days.every((day) => day.slice(0, 7) === days[0]?.slice(0, 7))
}

/** `3, 5 et 7 oct.` / `Oct 3, 5, and 7` : des jours d'un même mois n'écrivent le mois qu'une fois. */
export function formatDayList(days: readonly string[]): string {
  const locale = currentLocale()
  const monthAt = locale === 'fr' ? days.length - 1 : 0
  const compact = sameMonth(days)
  return new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
    days.map((day, index) =>
      !compact || index === monthAt ? formatDayMonth(day) : dayNumber(day),
    ),
  )
}

const WEEKDAY_DAY_MONTH_PATTERNS = { fr: 'EEEE d MMM', en: 'EEEE, MMM d' }

/** `vendredi 16 oct.` / `Friday, Oct 16`. */
export function formatWeekdayDayMonth(isoDate: string): string {
  return formatIn(isoDate, WEEKDAY_DAY_MONTH_PATTERNS)
}

/** `lundi` / `Monday`. */
export function formatWeekday(isoDate: string): string {
  return format(parseISO(isoDate), 'EEEE', { locale: DATE_LOCALES[currentLocale()] })
}

/** `23, 30 oct.`, `26 oct., 2 nov.` / `Oct 23, 30`, `Oct 26, Nov 2` : des dates à venir. */
export function formatDaySeries(days: readonly string[]): string {
  const monthAt = currentLocale() === 'fr' ? days.length - 1 : 0
  const compact = sameMonth(days)
  return days
    .map((day, index) => (!compact || index === monthAt ? formatDayMonth(day) : dayNumber(day)))
    .join(', ')
}

/** Les deux bouts d'une plage : `3` et `15 oct.` dans un même mois en français, sinon chaque date entière. */
export function formatDayRange(first: string, last: string): { start: string; end: string } {
  const compact = currentLocale() === 'fr' && sameMonth([first, last])
  return { start: compact ? dayNumber(first) : formatDayMonth(first), end: formatDayMonth(last) }
}

/** `6 août` – `6 févr. 2027` : la fin porte son année quand elle diffère de celle du début. */
export function formatPeriodRange(first: string, last: string): { start: string; end: string } {
  return first.slice(0, 4) === last.slice(0, 4)
    ? formatDayRange(first, last)
    : { start: formatDayMonth(first), end: formatLongDate(last) }
}
