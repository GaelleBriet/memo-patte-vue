import {
  applied,
  moveDose,
  newSettings,
  noteDose,
  settingsApplied,
  treatmentView,
  type SettingsPlan,
  type SettingsRequest,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { keys } from './dose-calendar.v2.aides'

let made = 0

function written(input: TreatmentViewInput, plan: SettingsPlan): TreatmentViewInput {
  if (plan.action === 'rewrite') return settingsApplied(input, plan)
  made += 1
  const createdAt = `2026-02-01T00:00:${String(made).padStart(2, '0')}.000Z`
  const created = { ...plan.setting, id: `r${made}`, stoppedOn: null, createdAt }
  return applied({ ...input, settings: [...input.settings, created] }, plan.lines ?? [])
}

export const on = (input: TreatmentViewInput, today: string) => ({ ...input, today })
const current = (input: TreatmentViewInput) => treatmentView(input).currentSetting!.id

export function given(
  input: TreatmentViewInput,
  dueOn: string,
  dueTime: string,
  status: 'given' | 'missed' = 'given',
) {
  const due = { settingId: current(input), dueOn, dueTime }
  const gesture = { due, status, givenOn: input.today, shiftsFollowing: false }
  const result = noteDose(input, gesture)
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return applied(input, result.changes)
}

export function moved(
  input: TreatmentViewInput,
  dueOn: string,
  dueTime: string | null,
  to: string,
  shifts = true,
) {
  const due = { settingId: current(input), dueOn, dueTime }
  const result = moveDose(input, { due, to, shiftsFollowing: shifts })
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return applied(input, result.changes)
}

export function edited(
  input: TreatmentViewInput,
  request: SettingsRequest,
  answer?: 'keep' | 'correct',
) {
  const result = newSettings(input, request)
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  if ('plan' in result) return written(input, result.plan)
  const plan = result.question[answer ?? 'keep']
  if ('refusal' in plan) throw new Error(JSON.stringify(plan))
  return written(input, plan)
}

export function readings(input: TreatmentViewInput) {
  const view = treatmentView(input)
  const reference = referenceReading({ ...input, until: '2026-06-30' })
  return {
    moteur: {
      phase: view.phase,
      moment: keys(view.currentDoses),
      aRenseigner: keys(view.unloggedDoses),
      ensuite: keys(view.upcoming({ limit: 3 })),
    },
    reference: {
      phase: reference.phase,
      moment: reference.current,
      aRenseigner: reference.unlogged,
      ensuite: reference.upcoming.slice(0, 3),
    },
  }
}

export type Reading = ReturnType<typeof readings>['moteur']

export const both = (expected: Reading) => ({ moteur: expected, reference: expected })
