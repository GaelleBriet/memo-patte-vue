import {
  newSettings,
  treatmentView,
  type Frequency,
  type Line,
  type Setting,
  type SettingsPlan,
  type SettingsRequest,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { FREQUENCIES, int, pick, plusDays, TIMES, type Random } from './carnet'

/** Ce que les gestes de réglage savent du carnet mené : tirages et horodatages. */
export type SettingsWalk = {
  input: TreatmentViewInput
  readonly random: Random
  readonly log: string[]
  stamp(): string
}

const MAX_SETTINGS = 5

/** Le carnet une fois le réglage écrit, comme le repository : un identifiant et un horodatage neufs. */
export function settingsWritten(walk: SettingsWalk, plan: SettingsPlan): TreatmentViewInput {
  const { settings } = walk.input
  const lines = linesWritten(walk, plan.lines ?? [])
  if (plan.action === 'rewrite') {
    const rewritten = settings.map((setting) =>
      setting.id === plan.id ? { ...setting, ...plan.setting } : setting,
    )
    return { ...walk.input, settings: rewritten, lines }
  }
  const created: Setting = {
    ...plan.setting,
    id: `s${settings.length + 1}`,
    stoppedOn: null,
    createdAt: walk.stamp(),
  }
  return { ...walk.input, settings: [...settings, created], lines }
}

// R7, #796 : le report que la date choisie fait arriver, réécrit ou supprimé comme par le repository.
function linesWritten(walk: SettingsWalk, changes: NonNullable<SettingsPlan['lines']>): Line[] {
  return changes.reduce<Line[]>(
    (lines, change) => {
      if (change.action === 'delete') return lines.filter(({ id }) => id !== change.id)
      const updatedAt = walk.stamp()
      return lines.map((line) =>
        line.id === change.id ? { ...change.line, id: line.id, updatedAt } : line,
      )
    },
    [...walk.input.lines],
  )
}

// « Modifier » : posologie seule, heures, fréquence, ou les deux (R3, R9) ; la première échéance
// proposée par le moteur, ou une autre date de « Prochaine dose ».
function requestOf(walk: SettingsWalk, current: Setting): SettingsRequest {
  const { random, input } = walk
  const draw = random()
  const frequency: Frequency =
    draw < 0.6 ? current.frequency : (pick(random, FREQUENCIES) ?? current.frequency)
  const times = draw < 0.4 || (draw >= 0.6 && draw < 0.8) ? current.times : pick(random, TIMES)!
  const endsOn = random() < 0.15 ? plusDays(input.today, int(random, 3, 40)) : current.endsOn
  const asked: SettingsRequest = { frequency, times: [...times], endsOn }
  if (random() < 0.7) return asked
  const upcoming = treatmentView(input)
    .upcoming({ limit: 6 })
    .map(({ dueOn }) => dueOn)
  const chosen = pick(random, [input.today, ...upcoming, plusDays(input.today, int(random, 1, 5))])
  // Q20 : le formulaire refuse une « Prochaine dose » après la date de fin (`nextDoseOnAfterEnd`).
  if (chosen === undefined || (endsOn !== null && chosen > endsOn)) return asked
  return { ...asked, firstDueOn: chosen }
}

/** « Modifier » joué : la demande du formulaire et le plan accepté. */
export type SettingsPlay = { request: SettingsRequest; plan: SettingsPlan }

/** « Modifier » joué, ou `null` : rien à modifier, ou refusé (le refus est consigné). */
export function changedSettings(walk: SettingsWalk): SettingsPlay | null {
  const view = treatmentView(walk.input)
  const current = view.currentSetting
  if (current === null || view.phase === 'stopped' || walk.input.settings.length >= MAX_SETTINGS) {
    return null
  }
  const asked = requestOf(walk, current)
  const label = `${walk.input.today} réglage ${JSON.stringify(asked)}`
  const result = newSettings(walk.input, asked)
  if ('refusal' in result) {
    walk.log.push(`${label} refusé (${result.refusal.reason})`)
    return null
  }
  if ('plan' in result) {
    walk.log.push(`${label} → ${JSON.stringify(result.plan)}`)
    return { request: asked, plan: result.plan }
  }
  const { keep, correct } = result.question
  // #806, #817 : « Elles n'étaient pas à donner » refusée, la personne garde les doses à renseigner.
  if ('refusal' in correct) walk.log.push(`${label} Q38 corrigé refusé (${correct.refusal.reason})`)
  const plan = walk.random() < 0.5 || 'refusal' in correct ? keep : correct
  walk.log.push(
    `${label} Q38 ${plan === keep ? 'à renseigner' : 'corrigé'} → ${JSON.stringify(plan)}`,
  )
  return { request: asked, plan }
}

/** « Arrêter » le réglage en cours ; `null` : rien à arrêter. */
export function stopped(walk: SettingsWalk): TreatmentViewInput | null {
  const current = treatmentView(walk.input).currentSetting
  const { settings, today } = walk.input
  if (current === null || current.stoppedOn !== null || current.startsOn > today) return null
  walk.log.push(`${today} arrêter`)
  const closed = settings.map((setting) =>
    setting.id === current.id ? { ...setting, stoppedOn: today } : setting,
  )
  return { ...walk.input, settings: closed }
}

/** « Reprendre » (R8) : un réglage à la première échéance choisie ; `null` : rien à reprendre. */
export function resumed(walk: SettingsWalk): TreatmentViewInput | null {
  const { settings, today } = walk.input
  const { random } = walk
  if (treatmentView(walk.input).phase !== 'stopped' || settings.length >= MAX_SETTINGS) return null
  const firstDueOn = plusDays(today, int(random, 0, 3))
  const resumedSetting: Setting = {
    id: `s${settings.length + 1}`,
    startsOn: today,
    firstDueOn,
    gridOriginOn: firstDueOn,
    firstDueChosen: true,
    pastDosesStayUnlogged: false,
    endsOn: random() < 0.2 ? plusDays(firstDueOn, int(random, 3, 40)) : null,
    stoppedOn: null,
    frequency: pick(random, FREQUENCIES)!,
    times: [...pick(random, TIMES)!],
    createdAt: walk.stamp(),
  }
  walk.log.push(`${today} reprendre ${JSON.stringify(resumedSetting)}`)
  return { ...walk.input, settings: [...settings, resumedSetting] }
}
