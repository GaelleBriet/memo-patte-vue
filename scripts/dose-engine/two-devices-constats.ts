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

// R8 : la journée d'arrivée après la fin du réglage qui la porterait ; le report n'y a rien à poser.
function endsBefore(input: TreatmentViewInput, day: string): boolean {
  const reading = input.settings
    .filter(({ startsOn }) => startsOn <= day)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.createdAt.localeCompare(b.createdAt))
    .at(-1)
  return reading?.endsOn !== null && reading?.endsOn !== undefined && reading.endsOn < day
}

// #867, #882, #883, #939 : report de A perdu après la synchro alors que A est le plus récent, ou que
// la réécriture de B n'a pas ôté sa dose de départ (la journée lue sans ce report l'a encore) ; une
// arrivée après la fin du traitement n'est pas une perte (R8).
function lostWith(fork: Fork, read: Reader, report: Line): boolean {
  const { plan, phoneA, merged, aFirst } = fork
  if (plan.action !== 'rewrite') return false
  if (effectOf(read, phoneA, report.id)?.kind !== 'moves') return false
  const effect = effectOf(read, merged, report.id)
  if (effect?.kind !== 'idle' || effect.reason !== 'nothing-to-move') return false
  if (endsBefore(merged, report.targetOn!)) return false
  if (!aFirst) return true
  const without = { ...merged, lines: merged.lines.filter(({ id }) => id !== report.id) }
  return read(without)
    .slots(report.dueOn, report.dueOn)
    .some(({ due }) => due.dueTime === report.dueTime)
}

// Les heures du réglage qui porte une journée, dans le carnet fusionné.
function hoursCountOn(input: TreatmentViewInput, day: string): number {
  const reading = input.settings
    .filter(({ startsOn }) => startsOn <= day)
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn) || a.createdAt.localeCompare(b.createdAt))
    .at(-1)
  return Math.max(1, reading?.times.length ?? 1)
}

// Dose de trop (Q4, 20 octobre 2026) : la journée de départ et ce que le report pose sur son arrivée
// comptent plus de doses que le réglage en vigueur n'a d'heures ; la dose du report n'apparaît qu'une fois.
function extraWith(fork: Fork, read: Reader, report: Line): string[] {
  const effect = effectOf(read, fork.merged, report.id)
  if (effect?.kind !== 'moves' || !effect.arrival) return []
  const count = (input: TreatmentViewInput, day: string) => read(input).slots(day, day).length
  const without = { ...fork.merged, lines: fork.merged.lines.filter(({ id }) => id !== report.id) }
  const arrived = count(fork.merged, effect.arrival) - count(without, effect.arrival)
  const doses = count(fork.merged, report.dueOn) + arrived
  const hours = hoursCountOn(fork.merged, report.dueOn)
  return doses > hours
    ? [`${report.dueOn} et ${effect.arrival} : ${doses} doses pour ${hours} heures`]
    : []
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
