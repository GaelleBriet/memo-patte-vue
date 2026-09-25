import { format, parseISO } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'

import { currentLocale } from '@/core/i18n'

const DATE_LOCALES = { fr, en: enUS }

const MINUS = '−'

function roundToDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

/** Un poids déjà dans son unité, à une décimale au séparateur de la langue : `24,5`, `24.5`. */
export function formatWeight(value: number): string {
  return new Intl.NumberFormat(currentLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format(roundToDecimal(value))
}

/** Graduation d'un axe : `24`, `24,5` en français, `24.5` en anglais. */
export function formatWeightAxis(value: number): string {
  return new Intl.NumberFormat(currentLocale(), {
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format(roundToDecimal(value))
}

/** Poids à corriger dans un champ : `24,55` tel que proposé, sans l'arrondi de l'affichage. */
export function formatWeightInput(value: number): string {
  return new Intl.NumberFormat(currentLocale(), {
    maximumFractionDigits: 20,
    useGrouping: false,
  }).format(value)
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
  return format(parseISO(isoDate), 'MMM yyyy', { locale: DATE_LOCALES[currentLocale()] })
}

/** `8 nov. 2026` / `Nov 8, 2026`. */
export function formatLongDate(isoDate: string): string {
  return format(parseISO(isoDate), 'PP', { locale: DATE_LOCALES[currentLocale()] })
}

const DAY_MONTH_PATTERNS = { fr: 'd MMM', en: 'MMM d' }
const FULL_DAY_MONTH_PATTERNS = { fr: 'd MMMM', en: 'MMMM d' }
const WEEKDAY_DATE_PATTERNS = { fr: 'EEE d MMM yyyy', en: 'EEE, MMM d, yyyy' }

function formatIn(isoDate: string, patterns: Record<'fr' | 'en', string>): string {
  const locale = currentLocale()
  return format(parseISO(isoDate), patterns[locale], { locale: DATE_LOCALES[locale] })
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

/** `25 août`, `Dec 20, 2025` d'un seul tenant : aucun retour à la ligne à l'intérieur. */
export function nonBreaking(text: string): string {
  return text.replaceAll(' ', '\u00a0')
}

/** `28 septembre` / `September 28` — lu par le lecteur d'écran. */
export function formatFullDayMonth(isoDate: string): string {
  return formatIn(isoDate, FULL_DAY_MONTH_PATTERNS)
}

/** `dim. 20 sept. 2026` / `Sun, Sep 20, 2026`. */
export function formatWeekdayDate(isoDate: string): string {
  return formatIn(isoDate, WEEKDAY_DATE_PATTERNS)
}

const FULL_DATE_PATTERNS = { fr: 'd MMMM yyyy', en: 'MMMM d, yyyy' }

/** `3 février 2026` / `February 3, 2026` — une date lue par le lecteur d'écran. */
export function formatFullDate(isoDate: string): string {
  const locale = currentLocale()
  return format(parseISO(isoDate), FULL_DATE_PATTERNS[locale], { locale: DATE_LOCALES[locale] })
}

/** `08/11/2026` / `11/08/2026`. */
export function formatNumericDate(isoDate: string): string {
  return format(parseISO(isoDate), 'P', { locale: DATE_LOCALES[currentLocale()] })
}
