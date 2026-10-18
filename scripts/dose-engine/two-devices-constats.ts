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

// Le carnet tel que `main` le lit : avant la v15, la réponse Q38 était le booléen « restent à
// renseigner », et une ligne « pas à donner » n'existait pas : `main` la lit comme un oubli.
function readByMain(main: Reader): Reader {
  return (input) =>
    main({
      ...input,
      settings: input.settings.map(({ fallenDosesAnswer, ...setting }) => ({
        ...setting,
        fallenDosesAnswer,
        pastDosesStayUnlogged: fallenDosesAnswer === 'stay-unlogged',
      })),
      lines: input.lines.map((line) =>
        line.status === 'not-due' ? { ...line, status: 'missed' as const } : line,
      ),
    })
}

const keyOf = (line: Line) => `${line.dueOn} ${line.dueTime}`
const isTaken = ({ status }: Line) => status === 'given' || status === 'missed'

// #873 : une prise l'emporte toujours sur la ligne « pas à donner » de sa dose ; un oubli dont
// l'échéance a quitté le calendrier reste sans effet sans elle (R4) et ne compte pas.
function takenGreyedByNotDue({ merged }: Fork): Line[] {
  const notDue = new Set(merged.lines.filter(({ status }) => status === 'not-due').map(keyOf))
  const countedIn = (input: TreatmentViewInput) =>
    new Set(
      treatmentView(input)
        .history.filter(({ line, effect }) => isTaken(line) && effect.kind !== 'idle')
        .map(({ line }) => keyOf(line)),
    )
  const counted = countedIn(merged)
  const greyed = merged.lines.filter(
    (line) => isTaken(line) && notDue.has(keyOf(line)) && !counted.has(keyOf(line)),
  )
  if (greyed.length === 0) return []
  const withoutNotDue = countedIn({
    ...merged,
    lines: merged.lines.filter(({ status }) => status !== 'not-due'),
  })
  return greyed.filter((line) => withoutNotDue.has(keyOf(line)))
}

/**
 * Les constats d'une fourche ; avec `main`, seuls ceux que `main` n'a pas aussi, sauf une prise
 * grisée par une ligne « pas à donner », que `main` ne sait pas lire.
 */
export function constatsOf(fork: Fork, mainReader?: Reader): string[] {
  const main = mainReader === undefined ? undefined : readByMain(mainReader)
  const where = `graine ${fork.seed}, pas ${fork.step}, ${fork.aFirst ? 'B' : 'A'} plus récent`
  const found = takenGreyedByNotDue(fork).map(
    (line) => `${where} : prise ${line.dueOn} ${line.dueTime} grisée par « pas à donner »`,
  )
  const report = newReport(fork)
  if (report === undefined) return found
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
