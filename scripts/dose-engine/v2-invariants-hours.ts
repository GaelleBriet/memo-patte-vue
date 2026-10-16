import {
  newSettings,
  settingsApplied,
  treatmentView,
  type SettingsPlan,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { episodeIdsOf } from '@/shared/domain/dose-calendar/settings'

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

/** Les journées de la période en cours qui portent une prise, ou l'origine ou l'arrivée d'un report. */
function touchedDays({ settings, lines }: TreatmentViewInput, settingId: string): Set<string> {
  const period = episodeIdsOf(settings, settingId)
  return new Set(
    lines.flatMap(({ status, dueOn, targetOn, settingId: own }) => {
      if (!period.has(own)) return []
      if (status === 'given' || status === 'missed') return [dueOn]
      return status === 'postponed' && targetOn !== null && targetOn !== dueOn
        ? [dueOn, targetOn]
        : []
    }),
  )
}

// Chaque journée d'avant aujourd'hui, et chaque journée touchée d'après : ses échéances et leur état.
function daysOf(input: TreatmentViewInput, touched: ReadonlySet<string>) {
  const last = [input.today, ...touched].sort().at(-1)!
  const from = firstDayOf(input)
  if (from > last) return []
  return treatmentView(input)
    .slots(from, last)
    .filter(
      ({ due }) => due.dueOn < input.today || (due.dueOn > input.today && touched.has(due.dueOn)),
    )
    .map(({ due, state }) => `${dueKey(due)} ${state}`)
}

/**
 * 3 bis. R4, R9 : changer seulement les heures, sans date, ne
 * change ni les heures ni l'état d'une journée passée, ni d'une journée à venir qui porte une ligne ;
 * « Elles restent à renseigner » comprise, « Elles n'étaient pas à donner » corrige le réglage (Q38).
 */
export function hoursOnly(input: TreatmentViewInput): Broken | null {
  const view = treatmentView(input)
  const current = view.currentSetting
  if (current === null || view.phase === 'stopped' || view.phase === 'ended') return null
  const touched = touchedDays(input, current.id)
  const before = daysOf(input, touched)
  for (const [label, times] of hoursTried(current.times)) {
    const result = newSettings(input, {
      frequency: current.frequency,
      times,
      endsOn: current.endsOn,
    })
    if ('refusal' in result) continue
    const plan: SettingsPlan = 'plan' in result ? result.plan : result.question.keep
    // R10 : remplacé le jour même, un réglage se recalcule comme un seul « Modifier », date comprise.
    const { firstDueOn, gridOriginOn } = plan.setting
    const recomputed = firstDueOn !== current.firstDueOn || gridOriginOn !== current.gridOriginOn
    if (plan.action === 'rewrite' && current.startsOn === input.today && recomputed) continue
    const after = daysOf(settingsApplied(input, plan), touched)
    const broken = compare(`heures seules (${label})`, before, after)
    if (broken !== null) return broken
  }
  return null
}
