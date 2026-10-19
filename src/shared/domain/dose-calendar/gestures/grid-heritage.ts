import { later, longestStep, plusDays } from '../grid'
import type { Day, Setting, SettingsPlan, TreatmentViewInput } from '../types'
import { buildView } from '../view'

const COMPARED_DUES = 6
const OPENING_ID = 'période-ouverte'
const LATEST = '9999-12-31T23:59:59.999Z'

const gridDateOf = (setting: Setting) =>
  setting.gridWrittenAt ?? setting.updatedAt ?? setting.createdAt

// La grille telle que le moteur la lit, décalages compris : ni prise, ni report, ni autre ligne.
function readDays(input: TreatmentViewInput, from: Day, to: Day): Day[] {
  const lines = input.lines.filter(({ status }) => status === 'shift')
  const days = buildView({ ...input, lines })
    .slots(from, to)
    .map(({ due }) => due.dueOn)
  return [...new Set(days)].slice(0, COMPARED_DUES)
}

function judged(
  before: TreatmentViewInput,
  after: TreatmentViewInput,
  opening: Setting,
): string | undefined {
  if (before.settings.length === 0) return undefined
  const view = buildView(before)
  const previous = view.currentSetting
  if (previous === null || view.phase === 'stopped' || view.phase === 'ended') return undefined
  if (previous.endsOn !== opening.endsOn) return undefined
  const from = later(opening.startsOn, opening.firstDueOn)
  const steps = Math.max(longestStep(previous.frequency), longestStep(opening.frequency))
  const to = plusDays(from, (COMPARED_DUES + 1) * steps)
  const same =
    JSON.stringify(readDays(before, from, to)) === JSON.stringify(readDays(after, from, to))
  return same ? gridDateOf(previous) : undefined
}

/**
 * La date de grille que la période écrite par `plan` hérite de celle qu'elle remplace, quand le moteur
 * lit les mêmes jours avec et sans elle à partir de sa première échéance, à fin égale ; `undefined` :
 * la période date sa grille elle-même. Une réécriture ne se juge ainsi que le jour où la période s'est
 * ouverte, face aux périodes qui la précèdent.
 */
export function inheritedGridAt(input: TreatmentViewInput, plan: SettingsPlan): string | undefined {
  if (plan.action === 'create') {
    const opening: Setting = { ...plan.setting, id: OPENING_ID, stoppedOn: null, createdAt: LATEST }
    return judged(input, { ...input, settings: [...input.settings, opening] }, opening)
  }
  const current = input.settings.find(({ id }) => id === plan.id)
  if (current === undefined || current.startsOn !== input.today) return undefined
  const before = {
    ...input,
    settings: input.settings.filter(({ id }) => id !== plan.id),
    lines: input.lines.filter(({ settingId }) => settingId !== plan.id),
  }
  const next = { ...current, ...plan.setting }
  return judged(before, { ...before, settings: [...before.settings, next] }, next)
}
