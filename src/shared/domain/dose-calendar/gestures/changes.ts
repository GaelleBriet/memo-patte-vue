import { keyOf, later, plusDays, sameFrequency } from '../grid'
import { familyOf } from '../lines'
import { withReportFacts } from '../report-facts'
import { episodesOf } from '../settings'
import { buildView } from '../view'
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
import type { TreatmentView } from '../view'

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
 * Le carnet une fois le réglage écrit, plus récent que tout le carnet (simulation, R12). La date de
 * grille héritée ne se juge qu'à l'écriture (`inheritedGridAt`) : la simulation date la grille comme
 * une écriture neuve.
 */
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
    }
    return { ...input, settings: [...input.settings, setting] }
  }
  const settings = input.settings.map((setting) =>
    setting.id === plan.id ? rewrittenSetting(setting, plan.setting, () => WRITTEN_AT) : setting,
  )
  return { ...input, settings }
}

/**
 * Le réglage réécrit sur place, daté comme par le repository ; `at` n'est lu que si une date change.
 * Avec le carnet où il s'écrit, sa date de grille se juge comme à l'écriture (`inheritedGridAt`).
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
  const inherited = carnet === undefined ? undefined : inheritedGridAt(carnet.input, plan)
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

const GRID_SPAN_DAYS = 400
const DAYS_PER_UNIT = { day: 1, week: 7 } as const

const gridDateOf = (setting: Setting) =>
  setting.gridWrittenAt ?? setting.updatedAt ?? setting.createdAt

// La même suite de jours : semaines et jours se convertissent, un mois jamais.
function equivalentSteps(a: Setting['frequency'], b: Setting['frequency']): boolean {
  if (a.unit === 'month' || b.unit === 'month') return sameFrequency(a, b)
  return a.value * DAYS_PER_UNIT[a.unit] === b.value * DAYS_PER_UNIT[b.unit]
}

// La grille que lit le moteur : décalages et reports seuls, sans prise ni autre ligne.
const gridView = (input: TreatmentViewInput) =>
  buildView({
    ...input,
    lines: input.lines.filter(({ status }) => status === 'shift' || status === 'postponed'),
  })

// Une dose reportée y compte à son départ.
function readDays(view: TreatmentView, from: Day, to: Day): Day[] {
  const days = new Set(view.slots(from, to).map(({ due }) => due.dueOn))
  for (const { line, effect } of view.history) {
    if (effect.kind !== 'moves') continue
    if (line.targetOn !== null) days.delete(line.targetOn)
    if (line.dueOn >= from && line.dueOn <= to) days.add(line.dueOn)
  }
  return [...days].sort()
}

function judged(
  before: TreatmentViewInput,
  after: TreatmentViewInput,
  opening: Setting,
): string | undefined {
  const previous = episodesOf(before.settings).at(-1)?.at(-1)
  if (previous === undefined || previous.endsOn !== opening.endsOn) return undefined
  if (!equivalentSteps(previous.frequency, opening.frequency)) return undefined
  const from = later(opening.startsOn, opening.firstDueOn)
  const to = opening.endsOn ?? plusDays(from, GRID_SPAN_DAYS)
  const days = (input: TreatmentViewInput) => JSON.stringify(readDays(gridView(input), from, to))
  if (days(before) !== days(after)) return undefined
  // Arrêté ou fini, prises comprises : une reprise ouvre une grille neuve.
  const { phase } = buildView(before)
  return phase === 'stopped' || phase === 'ended' ? undefined : gridDateOf(previous)
}

/**
 * La date de grille que la période écrite par `plan` (réglage et lignes) hérite de celle qu'elle
 * remplace : à fin égale et à fréquence équivalente, quand le moteur lit les mêmes jours de grille avec
 * et sans elle à partir de sa première échéance ; `undefined` : la période date sa grille elle-même. Une
 * réécriture ne se juge ainsi que le jour où la période s'est ouverte, face aux périodes d'avant.
 */
export function inheritedGridAt(input: TreatmentViewInput, plan: SettingsPlan): string | undefined {
  const changes = plan.lines ?? []
  if (plan.action === 'create') {
    const opening: Setting = {
      ...plan.setting,
      id: 'période-ouverte',
      stoppedOn: null,
      createdAt: WRITTEN_AT,
    }
    const after = applied({ ...input, settings: [...input.settings, opening] }, changes)
    return judged(input, after, opening)
  }
  const current = input.settings.find(({ id }) => id === plan.id)
  if (current === undefined || current.startsOn !== input.today) return undefined
  const before = {
    ...input,
    settings: input.settings.filter(({ id }) => id !== plan.id),
    lines: input.lines.filter(({ settingId }) => settingId !== plan.id),
  }
  if (before.settings.length === 0) return undefined
  const previous = episodesOf(before.settings).at(-1)?.at(-1)
  const ownDate = previous !== undefined && current.gridWrittenAt !== gridDateOf(previous)
  // Datée par elle-même puis touchée par un report d'une autre période : un seul « Modifier » l'aurait datée.
  const touched = input.lines.some(
    ({ settingId, status, updatedAt }) =>
      settingId !== plan.id &&
      (status === 'postponed' || status === 'shift') &&
      updatedAt >= current.createdAt,
  )
  if (ownDate && touched) return undefined
  const next = rewrittenSetting(current, plan.setting, () => WRITTEN_AT)
  return judged(before, applied({ ...before, settings: [...before.settings, next] }, changes), next)
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
