import {
  newSettings,
  treatmentView,
  type Due,
  type Setting,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { plusDays } from './carnet'
import { startV2Walk, v2Step, type V2Step } from './v2-walk'

/** Ce qu'une marche a montré : réponses « pas à donner », doses retirées, et celles jamais listées. */
export type ListedReport = { answers: number; removed: number; unlisted: string[] }

const keyOf = ({ dueOn, dueTime }: Pick<Due, 'dueOn' | 'dueTime'>) =>
  dueTime === null ? dueOn : `${dueOn} ${dueTime}`

function shownKeys(input: TreatmentViewInput): Set<string> {
  const first = input.settings
    .flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn])
    .sort()[0]!
  return new Set(
    treatmentView(input)
      .slots(first, plusDays(input.today, 90))
      .map(({ due }) => keyOf(due)),
  )
}

const unanswered = (setting: Setting): Setting =>
  setting.fallenDosesAnswer === 'not-due' ? { ...setting, fallenDosesAnswer: 'unasked' } : setting

/**
 * #873 : « Elles n'étaient pas à donner » ne retire que des doses que la question a montrées ; la liste
 * est relue ici en reposant la question sur le carnet d'avant la réponse, sans lire le réglage écrit.
 */
export function listedReport(seed: number, steps: number): ListedReport {
  const walk = startV2Walk(seed)
  const listed = new Set<string>()
  const report: ListedReport = { answers: 0, removed: 0, unlisted: [] }
  for (let count = 0; count < steps; count += 1) {
    let played: V2Step | null = null
    v2Step(walk, (step) => {
      played = step
    })
    const step = played as V2Step | null
    if (step?.plan?.answered && step.plan.setting.fallenDosesAnswer === 'not-due') {
      report.answers += 1
      const asked = newSettings(step.before, step.request!)
      if ('question' in asked) asked.question.fallen.forEach((due) => listed.add(keyOf(due)))
    }
    const input = walk.input
    if (!input.settings.some(({ fallenDosesAnswer }) => fallenDosesAnswer === 'not-due')) continue
    const shown = shownKeys(input)
    const removed = [...shownKeys({ ...input, settings: input.settings.map(unanswered) })].filter(
      (key) => !shown.has(key),
    )
    report.removed += removed.length
    const unlisted = removed.filter((key) => !listed.has(key))
    if (unlisted.length > 0) {
      report.unlisted.push(`graine ${seed}, ${input.today} : ${unlisted.join(', ')}`)
    }
  }
  return report
}
