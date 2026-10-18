import {
  moveDose,
  newSettings,
  noteDose,
  removeLine,
  settingsApplied,
  treatmentView,
  type LineChange,
  type SettingsPlan,
  type SettingsRequest,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { keys } from './dose-calendar.v2.aides'

// Comme le repository : un identifiant neuf et un horodatage plus récent que tout le carnet.
function nextStamp(input: TreatmentViewInput): string {
  const stamps = [...input.settings.map((s) => s.createdAt), ...input.lines.map((l) => l.updatedAt)]
  const latest = stamps.reduce((a, b) => (a > b ? a : b), '2026-02-01T00:00:00.000Z')
  return new Date(Date.parse(latest) + 1000).toISOString()
}

function recorded(input: TreatmentViewInput, changes: readonly LineChange[]): TreatmentViewInput {
  return changes.reduce((carnet, change) => {
    if (change.action === 'delete') {
      return { ...carnet, lines: carnet.lines.filter(({ id }) => id !== change.id) }
    }
    const updatedAt = nextStamp(carnet)
    const lines =
      change.action === 'rewrite'
        ? carnet.lines.map((l) =>
            l.id === change.id ? { ...change.line, id: l.id, updatedAt } : l,
          )
        : [...carnet.lines, { ...change.line, id: `l-${updatedAt}`, updatedAt }]
    return { ...carnet, lines }
  }, input)
}

function written(input: TreatmentViewInput, plan: SettingsPlan): TreatmentViewInput {
  if (plan.action === 'rewrite') {
    return recorded(settingsApplied(input, { ...plan, lines: [] }), plan.lines ?? [])
  }
  const createdAt = nextStamp(input)
  const created = { ...plan.setting, id: `r-${createdAt}`, stoppedOn: null, createdAt }
  return recorded({ ...input, settings: [...input.settings, created] }, plan.lines ?? [])
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
  return recorded(input, result.changes)
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
  return recorded(input, result.changes)
}

/** « Supprimer » une prise notée. */
export function removed(input: TreatmentViewInput, dueOn: string, dueTime: string) {
  const note = input.lines.find(
    (line) => line.status === 'given' && line.dueOn === dueOn && line.dueTime === dueTime,
  )!
  const result = removeLine(input, note.id)
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return recorded(input, result.changes)
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
