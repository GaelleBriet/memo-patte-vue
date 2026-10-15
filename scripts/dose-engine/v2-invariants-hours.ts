import {
  newSettings,
  settingsApplied,
  treatmentView,
  type SettingsPlan,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { plusDays } from './carnet'
import { dueKey } from './display'
import { compare, firstDayOf, type Broken } from './v2-reading'

const minuteLater = (time: string) => {
  const [hour, minute] = time.split(':').map(Number)
  return `${String(hour).padStart(2, '0')}:${String(minute! + 1).padStart(2, '0')}`
}

const ADDED = ['06:00', '09:00', '12:00', '14:00', '18:00', '20:00', '23:00']

/** Les heures que la campagne essaie : une minute plus tard, une heure ajoutée, retirée, aucune. */
function hoursTried(times: readonly string[]): [string, string[]][] {
  const tried: [string, string[]][] = []
  if (times.length > 0 && !times.some((time) => time.endsWith(':59'))) {
    tried.push(['une minute plus tard', times.map(minuteLater)])
  }
  const added = ADDED.find((hour) => !times.includes(hour))
  if (added !== undefined) tried.push(['heure ajoutée', [...times, added].sort()])
  if (times.length > 1) tried.push(['heure retirée', times.slice(1)])
  tried.push(times.length > 0 ? ['sans heure', []] : ['avec une heure', ['20:00']])
  return tried
}

// Les journées d'avant aujourd'hui : chaque échéance et son état, et ce que couvre chaque prise.
function pastOf(input: TreatmentViewInput) {
  const view = treatmentView(input)
  const yesterday = plusDays(input.today, -1)
  const from = firstDayOf(input)
  const slots =
    from > yesterday
      ? []
      : view.slots(from, yesterday).map(({ due, state }) => `${dueKey(due)} ${state}`)
  const covers = view.history.flatMap(({ line, effect }) =>
    effect.kind === 'covers' && effect.key.slice(0, 10) < input.today
      ? [`${line.id} ${effect.key}`]
      : [],
  )
  const late = view.currentDoses.filter(({ dueOn }) => dueOn < input.today).map(dueKey)
  return { slots, late, unlogged: view.unloggedDoses.map(dueKey), covers }
}

// Question ouverte (#854) : un report dont la journée d'origine est aujourd'hui ou plus tard, quand
// les heures d'avant la sienne changent de nombre ou qu'aucune ne la suit ; non jugé avant réponse.
function reportsTouched(input: TreatmentViewInput, from: readonly string[], to: readonly string[]) {
  return input.lines.some(({ status, dueOn, dueTime, targetOn }) => {
    if (status !== 'postponed' || targetOn === null || dueOn < input.today || dueTime === null) {
      return false
    }
    const before = (times: readonly string[]) => times.filter((time) => time < dueTime).length
    const follows = (times: readonly string[]) => times.some((time) => time >= dueTime)
    return before(from) !== before(to) || !follows(from) || !follows(to)
  })
}

/**
 * 3 bis. R9, décision du 15 octobre 2026 : changer seulement les heures, sans date, ne change ni l'état
 * ni l'heure d'aucune journée passée, et aucune prise n'y perd son effet ; « Elles restent à
 * renseigner » comprise ; « Elles n'étaient pas à donner » corrige le réglage (Q38, R10).
 */
export function hoursOnly(input: TreatmentViewInput): Broken | null {
  const view = treatmentView(input)
  const current = view.currentSetting
  if (current === null || view.phase === 'stopped' || view.phase === 'ended') return null
  const before = pastOf(input)
  for (const [label, times] of hoursTried(current.times)) {
    if (reportsTouched(input, current.times, times)) continue
    const result = newSettings(input, {
      frequency: current.frequency,
      times,
      endsOn: current.endsOn,
    })
    if ('refusal' in result) continue
    const plan: SettingsPlan = 'plan' in result ? result.plan : result.question.keep
    const broken = compare(`heures seules (${label})`, before, pastOf(settingsApplied(input, plan)))
    if (broken !== null) return broken
  }
  return null
}
