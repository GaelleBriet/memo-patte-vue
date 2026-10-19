import { keyOf } from '../grid'
import { familyOf } from '../lines'
import { withReportFacts } from '../report-facts'
import { inheritedGridAt } from './grid-heritage'
import type {
  Day,
  Line,
  LineChange,
  LineFields,
  Setting,
  SettingFields,
  SettingsPlan,
  TreatmentViewInput,
} from '../types'

const WRITTEN_AT = '9999-12-31T23:59:59.999Z'

const latest = (lines: readonly Line[]): Line | undefined =>
  [...lines]
    .sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id))
    .at(-1)

/** Comme le repository : une ligne par réglage, échéance et famille ; la plus récente est réécrite. */
export function written(lines: readonly Line[], fields: LineFields): LineChange {
  const key = keyOf(fields.dueOn, fields.dueTime)
  const existing = latest(
    lines.filter(
      (line) =>
        line.settingId === fields.settingId &&
        keyOf(line.dueOn, line.dueTime) === key &&
        familyOf(line) === familyOf(fields),
    ),
  )
  return existing === undefined
    ? { action: 'create', line: fields }
    : { action: 'rewrite', id: existing.id, line: fields }
}

/** R6, G17 : une journée n'a qu'une ligne de décalage, la plus récente. */
export function shiftOfDay(lines: readonly Line[], day: Day): Line | undefined {
  return latest(lines.filter((line) => line.status === 'shift' && line.dueOn === day))
}

/** La ligne de décalage d'une journée, écrite ancrée à ce jour, en réécrivant celle qui existe. */
export function shiftWritten(
  lines: readonly Line[],
  at: Pick<Line, 'settingId' | 'dueOn' | 'dueTime'>,
  anchoredOn: Day,
): LineChange {
  const existing = shiftOfDay(lines, at.dueOn)
  const line: LineFields = {
    settingId: at.settingId,
    dueOn: at.dueOn,
    dueTime: existing?.dueTime ?? at.dueTime,
    status: 'shift',
    givenOn: null,
    targetOn: anchoredOn,
  }
  return existing === undefined
    ? { action: 'create', line }
    : { action: 'rewrite', id: existing.id, line }
}

const withDevice = (line: Line, device: string | undefined): Line =>
  device === undefined ? line : { ...line, createdByDevice: device }

/**
 * Le carnet une fois les lignes écrites, chacune plus récente que tout le carnet (simulation, R12) ;
 * une ligne réécrite garde le téléphone qui l'a créée, comme le repository.
 */
export function applied(
  input: TreatmentViewInput,
  changes: readonly LineChange[],
): TreatmentViewInput {
  let lines = [...input.lines]
  changes.forEach((change, index) => {
    if (change.action === 'delete') {
      lines = lines.filter(({ id }) => id !== change.id)
      return
    }
    const id = change.action === 'rewrite' ? change.id : `écrite-${index}`
    const facts = withReportFacts(lines, input.settings, change)
    const line: Line = { ...facts.line, id, updatedAt: WRITTEN_AT }
    lines =
      change.action === 'rewrite'
        ? lines.map((each) => (each.id === id ? withDevice(line, each.createdByDevice) : each))
        : [...lines, withDevice(line, input.device)]
  })
  return { ...input, lines }
}

export function without(input: TreatmentViewInput, ids: readonly string[]): TreatmentViewInput {
  return { ...input, lines: input.lines.filter(({ id }) => !ids.includes(id)) }
}

/** Le carnet une fois le réglage écrit, plus récent que tout le carnet (simulation, R12). */
export function settingsApplied(input: TreatmentViewInput, plan: SettingsPlan): TreatmentViewInput {
  return applied(settingWritten(input, plan), plan.lines ?? [])
}

function settingWritten(input: TreatmentViewInput, plan: SettingsPlan): TreatmentViewInput {
  if (plan.action === 'create') {
    const setting: Setting = {
      ...plan.setting,
      id: 'réglage-écrit',
      stoppedOn: null,
      createdAt: WRITTEN_AT,
      gridWrittenAt: inheritedGridAt(input, plan) ?? WRITTEN_AT,
    }
    return { ...input, settings: [...input.settings, setting] }
  }
  const settings = input.settings.map((setting) =>
    setting.id === plan.id
      ? rewrittenSetting(setting, plan.setting, () => WRITTEN_AT, input)
      : setting,
  )
  return { ...input, settings }
}

/** Le réglage réécrit sur place, daté comme par le repository ; `at` n'est lu que si une date change. */
export function rewrittenSetting(
  setting: Setting,
  fields: SettingFields,
  at: () => string,
  carnet: TreatmentViewInput,
): Setting {
  const next = { ...setting, ...fields }
  const inherited = inheritedGridAt(carnet, { action: 'rewrite', id: setting.id, setting: fields })
  const calendar = rewritesCalendar(setting, next)
  const grid = inherited === undefined && rewritesGrid(setting, next)
  const kept = inherited === undefined ? {} : { gridWrittenAt: inherited }
  if (!calendar && !grid) return { ...next, ...kept }
  const written = at()
  return {
    ...next,
    ...(calendar ? { updatedAt: written } : {}),
    ...(grid ? { gridWrittenAt: written } : kept),
  }
}

const CALENDAR = [
  'startsOn',
  'firstDueOn',
  'frequency',
  'times',
  'gridOriginOn',
  'firstDueChosen',
] as const

const GRID = ['firstDueOn', 'frequency', 'gridOriginOn', 'endsOn'] as const

const changes =
  (fields: readonly (keyof Setting)[]) =>
  (before: Setting, after: Setting): boolean =>
    fields.some((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]))

/** R10, #867 : seule une réécriture du calendrier date le réglage, comme le fait le repository. */
export const rewritesCalendar = changes(CALENDAR)

export const rewritesGrid = changes(GRID)
