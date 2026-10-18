import { treatmentView, type Line, type TreatmentViewInput } from '@/shared/domain/dose-calendar'

import type { Fork } from './two-devices'

/** Un moteur qui lit un carnet : celui de la branche, ou celui de `main` pour comparer. */
export type Reader = typeof treatmentView

function newReport(fork: Fork): Line | undefined {
  return fork.phoneA.lines.find(
    (line) =>
      line.status === 'postponed' &&
      !fork.base.lines.some((old) => old.id === line.id && old.updatedAt === line.updatedAt),
  )
}

const effectOf = (read: Reader, input: TreatmentViewInput, id: string) =>
  read(input).history.find(({ line }) => line.id === id)?.effect

// #867, #883 : report de A perdu après la synchro alors que la réécriture de B, sur son réglage, n'a
// pas ôté sa dose de départ (la journée lue sans ce report l'a encore).
function lostWith(fork: Fork, read: Reader, report: Line): boolean {
  const { plan, phoneA, merged } = fork
  if (plan.action !== 'rewrite' || plan.id !== report.settingId) return false
  if (effectOf(read, phoneA, report.id)?.kind !== 'moves') return false
  const effect = effectOf(read, merged, report.id)
  if (effect?.kind !== 'idle' || effect.reason !== 'nothing-to-move') return false
  const without = { ...merged, lines: merged.lines.filter(({ id }) => id !== report.id) }
  return read(without)
    .slots(report.dueOn, report.dueOn)
    .some(({ due }) => due.dueTime === report.dueTime)
}

// Dose de trop : le jour d'arrivée du report porte une heure que ni A ni B n'y montraient.
function extraWith(fork: Fork, read: Reader, report: Line): string[] {
  const effect = effectOf(read, fork.merged, report.id)
  if (effect?.kind !== 'moves' || !effect.arrival) return []
  const day = effect.arrival
  const hours = (input: TreatmentViewInput) =>
    read(input)
      .slots(day, day)
      .map(({ due }) => due.dueTime)
  const shown = new Set([...hours(fork.phoneA), ...hours(fork.phoneB)])
  return hours(fork.merged)
    .filter((hour) => !shown.has(hour))
    .map((hour) => `${day} ${hour}`)
}

/** Les constats d'une fourche ; avec `main`, seuls ceux que `main` n'a pas aussi. */
export function constatsOf(fork: Fork, main?: Reader): string[] {
  const report = newReport(fork)
  if (report === undefined) return []
  const where = `graine ${fork.seed}, pas ${fork.step}, ${fork.aFirst ? 'B' : 'A'} plus récent`
  const found: string[] = []
  if (lostWith(fork, treatmentView, report) && !(main && lostWith(fork, main, report))) {
    found.push(`${where} : report ${report.dueOn} ${report.dueTime} → ${report.targetOn} perdu`)
  }
  // Sans `main`, une heure d'arrivée prise au réglage de B (#883, §11) ne se distingue pas d'un écart.
  if (main === undefined) return found
  const extra = extraWith(fork, treatmentView, report)
  if (extra.length > 0 && JSON.stringify(extra) !== JSON.stringify(extraWith(fork, main, report))) {
    found.push(`${where} : dose de trop ${extra.join(', ')}`)
  }
  return found
}
