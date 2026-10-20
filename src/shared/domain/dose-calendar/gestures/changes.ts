import { keyOf } from '../grid'
import { gridBeforeOf, keepsGridBefore } from '../grid-before'
import { familyOf } from '../lines'
import { withReportFacts } from '../report-facts'
import type {
  Day,
  GridBefore,
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

/**
 * Le carnet une fois le réglage écrit, plus récent que tout le carnet (simulation, R12). Une
 * réécriture date sa grille comme à l'écriture (`judgedGrid`), puisque le report se juge contre elle
 * (#939) ; une période ouverte, jamais réécrite, n'est jugée contre aucun report.
 */
export function settingsApplied(input: TreatmentViewInput, plan: SettingsPlan): TreatmentViewInput {
  return applied(settingWritten(input, plan), plan.lines ?? [])
}

function settingWritten(input: TreatmentViewInput, plan: SettingsPlan): TreatmentViewInput {
  const lines = plan.lines ?? []
  if (plan.action === 'create') {
    const setting: Setting = {
      ...plan.setting,
      id: 'réglage-écrit',
      stoppedOn: null,
      createdAt: WRITTEN_AT,
    }
    return { ...input, settings: [...input.settings, setting] }
  }
  const settings = input.settings.map((setting) =>
    setting.id === plan.id
      ? rewrittenSetting(setting, plan.setting, () => WRITTEN_AT, { input, lines })
      : setting,
  )
  return { ...input, settings }
}

/**
 * Le réglage réécrit sur place, daté comme par le repository ; `at` n'est lu que si une date change.
 * Avec le carnet où il s'écrit, sa date de grille se juge comme à l'écriture (`judgedGrid`).
 */
export function rewrittenSetting(
  setting: Setting,
  fields: SettingFields,
  at: () => string,
  carnet?: { input: TreatmentViewInput; lines: readonly LineChange[] },
): Setting {
  const next = { ...setting, ...fields }
  const plan: SettingsPlan = {
    action: 'rewrite',
    id: setting.id,
    setting: fields,
    lines: [...(carnet?.lines ?? [])],
  }
  const inherited = carnet === undefined ? undefined : judgedGrid(carnet.input, plan).writtenAt
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

/** La grille d'avant l'ouverture que garde la période écrite, et sa date de grille jugée. */
export type JudgedGrid = { writtenAt?: string; before: GridBefore | null }

/**
 * La date de grille, jugée par le moteur, que l'écriture de `plan` (réglage et lignes) pose telle
 * quelle : celle gardée à l'ouverture si les jours lus sont ceux de la grille d'avant l'ouverture ;
 * pour une réécriture du jour jugée datée, l'ouverture de la période à la place d'une date héritée ;
 * `writtenAt` absente : la période date sa grille elle-même. Une réécriture ne se juge que le jour de
 * l'ouverture, contre la grille gardée à l'ouverture.
 */
export function judgedGrid(input: TreatmentViewInput, plan: SettingsPlan): JudgedGrid {
  const changes = plan.lines ?? []
  if (plan.action === 'create') {
    const before = gridBeforeOf(input, plan.setting.startsOn)
    if (before === null) return { before }
    const opening: Setting = {
      ...plan.setting,
      id: 'période-ouverte',
      stoppedOn: null,
      createdAt: WRITTEN_AT,
    }
    const after = applied({ ...input, settings: [...input.settings, opening] }, changes)
    return keepsGridBefore(before, opening, after)
      ? { writtenAt: before.writtenAt, before }
      : { before }
  }
  const current = input.settings.find(({ id }) => id === plan.id)
  const before = current?.gridBefore ?? null
  if (current === undefined || before === null || current.startsOn !== input.today)
    return { before }
  const next = rewrittenSetting(current, plan.setting, () => WRITTEN_AT)
  const settings = input.settings.map((setting) => (setting.id === plan.id ? next : setting))
  if (keepsGridBefore(before, next, applied({ ...input, settings }, changes))) {
    return { writtenAt: before.writtenAt, before }
  }
  // Jugée datée : une date héritée plus tôt dans la journée cède la place à l'ouverture de la période.
  const inherited = current.gridWrittenAt !== undefined && current.gridWrittenAt < current.createdAt
  return inherited ? { writtenAt: current.createdAt, before } : { before }
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
