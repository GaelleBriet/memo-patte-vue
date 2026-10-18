import {
  newSettings,
  treatmentView,
  type Due,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { plusDays } from './carnet'
import { startV2Walk, v2Step, type V2Step } from './v2-walk'

/**
 * Ce qu'un carnet a montré : réponses « pas à donner », doses retirées, celles retirées sans avoir été
 * listées, et celles listées qui se montrent encore à donner.
 */
export type ListedReport = {
  answers: number
  removed: number
  unlisted: string[]
  reshown: string[]
}

const keyOf = ({ dueOn, dueTime }: Pick<Due, 'dueOn' | 'dueTime'>) =>
  dueTime === null ? dueOn : `${dueOn} ${dueTime}`

function shownKeys(input: TreatmentViewInput): Map<string, string> {
  const first = input.settings
    .flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn])
    .sort()[0]!
  return new Map(
    treatmentView(input)
      .slots(first, plusDays(input.today, 90))
      .map(({ due, state }) => [keyOf(due), state]),
  )
}

const withoutNotDue = (input: TreatmentViewInput): TreatmentViewInput => ({
  ...input,
  lines: input.lines.filter(({ status }) => status !== 'not-due'),
})

/**
 * #873 : seules les doses que la question a montrées sortent, et une dose listée ne se montre plus à
 * donner tant que sa ligne n'a pas été supprimée ni battue par une ligne plus récente. La liste est
 * relue en reposant la question sur le carnet d'avant la réponse, sans lire les lignes écrites.
 */
export function listedInput(input: TreatmentViewInput, listed: ReadonlySet<string>) {
  const shown = shownKeys(input)
  const before = shownKeys(withoutNotDue(input))
  const removed = [...before.keys()].filter((key) => !shown.has(key))
  const effects = new Map(treatmentView(input).history.map(({ line, effect }) => [line.id, effect]))
  const reshown = input.lines
    .filter(({ status }) => status === 'not-due')
    .filter((line) => {
      const effect = effects.get(line.id)
      const lost = effect?.kind === 'idle' && effect.reason !== 'nothing-to-cover'
      const stillDue = shown.get(keyOf(line)) === 'pending'
      const dayLeftUncovered =
        effect?.kind === 'idle' &&
        effect.reason === 'nothing-to-cover' &&
        [...shown.keys()].some((key) => key.slice(0, 10) === line.dueOn)
      return !lost && listed.has(keyOf(line)) && (stillDue || dayLeftUncovered)
    })
    .map(keyOf)
  // C2 : une journée dont toutes les doses ont été listées sort en entier si ses heures ont changé.
  const sameDay = (a: string, b: string) => a.slice(0, 10) === b.slice(0, 10)
  const wholeDayOut = (key: string) =>
    [...listed].some((each) => sameDay(each, key)) &&
    ![...shown.keys()].some((each) => sameDay(each, key)) &&
    ![...before.keys()].some((each) => sameDay(each, key) && listed.has(each))
  const unlisted = removed.filter((key) => !listed.has(key) && !wholeDayOut(key))
  return { removed, unlisted, reshown }
}

export function listedReport(seed: number, steps: number): ListedReport {
  const walk = startV2Walk(seed)
  const listed = new Set<string>()
  const report: ListedReport = { answers: 0, removed: 0, unlisted: [], reshown: [] }
  for (let count = 0; count < steps; count += 1) {
    let played: V2Step | null = null
    v2Step(walk, (step) => {
      played = step
    })
    const step = played as V2Step | null
    if (step?.plan?.setting.fallenDosesAnswer === 'not-due' && step.request !== undefined) {
      const asked = newSettings(step.before, step.request)
      if (
        'question' in asked &&
        JSON.stringify(asked.question.correct) === JSON.stringify(step.plan)
      ) {
        report.answers += 1
        asked.question.fallen.forEach((due) => listed.add(keyOf(due)))
      }
    }
    const found = listedInput(walk.input, listed)
    report.removed += found.removed.length
    const where = `graine ${seed}, ${walk.input.today}`
    if (found.unlisted.length > 0) report.unlisted.push(`${where} : ${found.unlisted.join(', ')}`)
    if (found.reshown.length > 0) report.reshown.push(`${where} : ${found.reshown.join(', ')}`)
  }
  return report
}
