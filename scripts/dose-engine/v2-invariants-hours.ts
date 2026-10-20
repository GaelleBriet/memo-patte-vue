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

/**
 * Les journées de la période en cours qui portent une prise ou l'origine d'un report, en entier ; un jour
 * d'arrivée, ses seules doses reportées (R7 : une journée d'échéance garde ses doses et y ajoute les
 * siennes, les doses de la grille suivent les heures en vigueur).
 */
function touchedDays(
  input: TreatmentViewInput,
  settingId: string,
): Map<string, Set<string> | null> {
  const period = episodeIdsOf(input.settings, settingId)
  const touched = new Map<string, Set<string> | null>()
  for (const { status, dueOn, settingId: own } of input.lines) {
    if (period.has(own) && (status === 'given' || status === 'missed' || status === 'postponed')) {
      touched.set(dueOn, null)
    }
  }
  for (const { line, effect } of treatmentView(input).history) {
    if (
      effect.kind !== 'moves' ||
      effect.arrival === null ||
      touched.get(effect.arrival) === null
    ) {
      continue
    }
    const hours = touched.get(effect.arrival) ?? new Set<string>()
    // Q1 : la dose retirée de l'ancienne arrivée n'est pas une heure qui arrive.
    const departing = effect.keys.filter((key) => key.startsWith(line.dueOn))
    for (const key of departing.length > 0 ? departing : effect.keys) hours.add(key.slice(11))
    touched.set(effect.arrival, hours)
  }
  return touched
}

// Chaque journée d'avant aujourd'hui, et chaque journée touchée d'après : ses échéances et leur état.
function daysOf(input: TreatmentViewInput, touched: ReadonlyMap<string, Set<string> | null>) {
  const last = [input.today, ...touched.keys()].sort().at(-1)!
  const from = firstDayOf(input)
  if (from > last) return []
  const kept = ({ dueOn, dueTime }: { dueOn: string; dueTime: string | null }) => {
    if (dueOn < input.today) return true
    if (dueOn === input.today || !touched.has(dueOn)) return false
    const hours = touched.get(dueOn)
    return hours === null || hours!.has(dueTime ?? '')
  }
  return treatmentView(input)
    .slots(from, last)
    .filter(({ due }) => kept(due))
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
    const sameDay = plan.action === 'rewrite' && current.startsOn === input.today
    if (sameDay && recomputed) continue
    // R7, #796 : la date choisie garde les heures de son réglage, que ce « Modifier » remplace, et
    // sa dose redéplacée les emmène (Q-a, G13).
    const chosenDay = sameDay && current.firstDueChosen ? current.firstDueOn : null
    const fromChosen = new Set(
      input.lines
        .filter((line) => chosenDay !== null && line.previousTargetOn === chosenDay)
        .map((line) => line.targetOn),
    )
    const kept = new Map([...touched].filter(([day]) => day !== chosenDay && !fromChosen.has(day)))
    const after = daysOf(settingsApplied(input, plan), kept)
    const broken = compare(
      `heures seules (${label})`,
      chosenDay ? daysOf(input, kept) : before,
      after,
    )
    if (broken !== null) return broken
  }
  return null
}
