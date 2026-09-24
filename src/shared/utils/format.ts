import { format, parseISO } from 'date-fns'
import { enUS, fr } from 'date-fns/locale'

import { currentLocale } from '@/core/i18n'

const DATE_LOCALES = { fr, en: enUS }

const MINUS = '−'

function roundToDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

/** Une décimale au séparateur de la langue : `24,5` en français, `24.5` en anglais. */
export function formatKg(value: number): string {
  return new Intl.NumberFormat(currentLocale(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format(roundToDecimal(value))
}

/** Graduation d'un axe : `24`, `24,5` en français, `24.5` en anglais. */
export function formatKgAxis(value: number): string {
  return new Intl.NumberFormat(currentLocale(), {
    maximumFractionDigits: 1,
    useGrouping: false,
  }).format(roundToDecimal(value))
}

/** `+0,5`, `−0,3`, ou `±0,0` quand rien ne bouge à la décimale près. */
export function formatKgDelta(delta: number): string {
  const rounded = roundToDecimal(delta)
  if (rounded === 0) return `±${formatKg(0)}`
  return `${rounded > 0 ? '+' : MINUS}${formatKg(Math.abs(rounded))}`
}

/** `août` / `August` — pour « vs août ». */
export function formatMonth(isoDate: string): string {
  return format(parseISO(isoDate), 'MMMM', { locale: DATE_LOCALES[currentLocale()] })
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
