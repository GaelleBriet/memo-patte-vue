import { format, parseISO } from 'date-fns'
import { fr } from 'date-fns/locale'

const MINUS = '−'

function roundToDecimal(value: number): number {
  return Math.round(value * 10) / 10
}

/** Une décimale, virgule française : `24,5`, jamais `24.5` ni `24,50`. */
export function formatKg(value: number): string {
  return roundToDecimal(value).toFixed(1).replace('.', ',')
}

/** `+0,5`, `−0,3`, ou `±0,0` quand rien ne bouge à la décimale près. */
export function formatKgDelta(delta: number): string {
  const rounded = roundToDecimal(delta)
  if (rounded === 0) return `±${formatKg(0)}`
  return `${rounded > 0 ? '+' : MINUS}${formatKg(Math.abs(rounded))}`
}

/** `août`, `septembre` — pour « vs août ». */
export function formatMonth(isoDate: string): string {
  return format(parseISO(isoDate), 'MMMM', { locale: fr })
}

/** `Juin`, `Juil.`, `Sept.` — libellés sous une courbe. */
export function formatMonthShort(isoDate: string): string {
  const month = format(parseISO(isoDate), 'MMM', { locale: fr })
  return month.charAt(0).toLocaleUpperCase('fr') + month.slice(1)
}

/** `8 nov. 2026`. */
export function formatLongDate(isoDate: string): string {
  return format(parseISO(isoDate), 'd MMM yyyy', { locale: fr })
}
