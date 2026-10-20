import { gridDateOf, later, longestStep, plusDays, runDays, sameFrequency, stepped } from './grid'
import { episodesOf } from './settings'
import type { Day, Frequency, GridBefore, GridRun, Setting, TreatmentViewInput } from './types'
import { buildView } from './view'

const WINDOW_DAYS = 400
const FIRST_DUE_REACH_DAYS = 800
// Assez de pas pour qu'une suite en mois ait traversé toutes les fins de mois, février compris.
const CHECKED_STEPS = 14

const DAYS_PER_UNIT = { day: 1, week: 7 } as const

// La même suite de jours : semaines et jours se convertissent, un mois jamais.
function equivalentSteps(a: Frequency, b: Frequency): boolean {
  if (a.unit === 'month' || b.unit === 'month') return sameFrequency(a, b)
  return a.value * DAYS_PER_UNIT[a.unit] === b.value * DAYS_PER_UNIT[b.unit]
}

// Décalages et reports seuls : une dose reportée compte à son départ, jamais à son arrivée.
function gridDaysRead(input: TreatmentViewInput, from: Day, to: Day): Day[] {
  const lines = input.lines.filter(({ status }) => status === 'shift' || status === 'postponed')
  const view = buildView({ ...input, lines })
  const days = new Set(view.slots(from, to).map(({ due }) => due.dueOn))
  for (const { line, effect } of view.history) {
    if (effect.kind !== 'moves') continue
    if (line.targetOn !== null) days.delete(line.targetOn)
    if (line.dueOn >= from && line.dueOn <= to) days.add(line.dueOn)
  }
  return [...days].sort()
}

function runsOf(days: readonly Day[], frequency: Frequency, endless: boolean): GridRun[] {
  const runs: [Day, Day | null][] = []
  let step = 0
  for (const day of days) {
    const run = runs.at(-1)
    if (run !== undefined && day === stepped(run[0], frequency, step + 1)) {
      step += 1
      run[1] = day
      continue
    }
    runs.push([day, day])
    step = 0
  }
  // Sans fin, la dernière suite continue au-delà de l'horizon lu ; avec une fin, elle s'arrête au dernier jour lu.
  const last = runs.at(-1)
  if (endless && last !== undefined) last[1] = null
  return runs
}

/**
 * La grille que le moteur lit juste avant d'ouvrir une période le jour `startsOn`, et la date de grille
 * de la période remplacée, à reprendre si la période la garde ; `null` : rien à reprendre (pas de
 * période en cours, arrêtée ou finie).
 */
export function gridBeforeOf(input: TreatmentViewInput, startsOn: Day): GridBefore | null {
  const previous = episodesOf(input.settings).at(-1)?.at(-1)
  if (previous === undefined) return null
  const { phase } = buildView(input)
  if (phase === 'stopped' || phase === 'ended') return null
  const lastLine = input.lines
    .flatMap(({ dueOn, targetOn }) => (targetOn === null ? [dueOn] : [dueOn, targetOn]))
    .reduce(later, startsOn)
  const reach = Math.max(
    FIRST_DUE_REACH_DAYS + WINDOW_DAYS,
    CHECKED_STEPS * longestStep(previous.frequency),
  )
  const to = previous.endsOn ?? plusDays(lastLine, reach)
  const { frequency, endsOn } = previous
  return {
    frequency,
    endsOn,
    writtenAt: gridDateOf(previous),
    runs: runsOf(gridDaysRead(input, startsOn, to), frequency, endsOn === null),
  }
}

/**
 * Une période reprend la grille d'avant son ouverture quand, à fin égale et à fréquence équivalente, le
 * moteur lit ses jours de grille à partir de sa première échéance : jusqu'à sa fin, ou 400 jours.
 */
export function keepsGridBefore(
  gridBefore: GridBefore,
  opening: Setting,
  after: TreatmentViewInput,
): boolean {
  if (gridBefore.endsOn !== opening.endsOn) return false
  if (!equivalentSteps(gridBefore.frequency, opening.frequency)) return false
  const from = later(opening.startsOn, opening.firstDueOn)
  const to = opening.endsOn ?? plusDays(from, WINDOW_DAYS)
  const before = runDays(gridBefore.runs, gridBefore.frequency, from, to)
  return JSON.stringify(before) === JSON.stringify(gridDaysRead(after, from, to))
}
