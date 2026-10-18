import {
  moveBounds,
  newSettings,
  play,
  rewritesCalendar,
  treatmentView,
  type Line,
  type LineChange,
  type Setting,
  type SettingsPlan,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { FREQUENCIES, TIMES, int, mulberry32, pick, plusDays } from './carnet'
import { startV2Walk, stampOf, v2Step } from './v2-walk'

/** Une fourche : le même carnet sur deux téléphones, A fait un geste, B « Modifier », puis la synchro. */
export type Fork = {
  seed: number
  step: number
  /** A écrit d'abord : le réglage de B est le plus récent. */
  aFirst: boolean
  gesture: unknown
  plan: SettingsPlan
  base: TreatmentViewInput
  phoneA: TreatmentViewInput
  phoneB: TreatmentViewInput
  merged: TreatmentViewInput
}

type Clock = { n: number }

function stamp(clock: Clock): string {
  clock.n += 1
  return new Date(Date.UTC(2026, 5, 1, 0, 0, clock.n)).toISOString()
}

function writeLines(
  input: TreatmentViewInput,
  changes: readonly LineChange[],
  clock: Clock,
  tag: string,
) {
  let lines = [...input.lines]
  for (const change of changes) {
    if (change.action === 'delete') {
      lines = lines.filter(({ id }) => id !== change.id)
      continue
    }
    const updatedAt = stamp(clock)
    lines =
      change.action === 'rewrite'
        ? lines.map((line) =>
            line.id === change.id ? { ...change.line, id: line.id, updatedAt } : line,
          )
        : [...lines, { ...change.line, id: `${tag}${clock.n}`, updatedAt }]
  }
  return { ...input, lines }
}

function writePlan(input: TreatmentViewInput, plan: SettingsPlan, clock: Clock, tag: string) {
  const { lines } = writeLines(input, plan.lines ?? [], clock, tag)
  const at = stamp(clock)
  const answered = plan.answered ? { answeredAt: at, answeredDues: plan.answered.listed } : {}
  if (plan.action === 'rewrite') {
    const settings = input.settings.map((setting) => {
      if (setting.id !== plan.id) return setting
      const next = { ...setting, ...plan.setting, ...answered }
      return rewritesCalendar(setting, next) ? { ...next, updatedAt: at } : next
    })
    return { ...input, lines, settings }
  }
  const created: Setting = {
    ...plan.setting,
    id: `${tag}s${clock.n}`,
    stoppedOn: null,
    createdAt: at,
    ...answered,
  }
  return { ...input, lines, settings: [...input.settings, created] }
}

// La synchro : par ligne et par réglage, la modification la plus récente gagne.
function synced(base: TreatmentViewInput, a: TreatmentViewInput, b: TreatmentViewInput) {
  const lines = new Map<string, Line>()
  for (const line of [...a.lines, ...b.lines]) {
    const kept = lines.get(line.id)
    if (kept === undefined || line.updatedAt > kept.updatedAt) lines.set(line.id, line)
  }
  const removed = new Set(
    base.lines
      .map(({ id }) => id)
      .filter((id) => !a.lines.some((l) => l.id === id) || !b.lines.some((l) => l.id === id)),
  )
  const settings = new Map<string, Setting>()
  for (const setting of [...a.settings, ...b.settings]) {
    const kept = settings.get(setting.id)
    const at = (each: Setting) => each.updatedAt ?? each.createdAt
    if (kept === undefined || at(setting) >= at(kept)) settings.set(setting.id, setting)
  }
  return {
    ...base,
    settings: [...settings.values()],
    lines: [...lines.values()].filter(({ id }) => !removed.has(id)),
  }
}

// La date d'écriture du réglage n'avance que si son calendrier change (migration v14).
function writtenDates(
  before: readonly Setting[],
  after: readonly Setting[],
  written: Map<string, string>,
  next: () => string,
) {
  for (const setting of after) {
    const old = before.find(({ id }) => id === setting.id)
    if (old === undefined) {
      if (!written.has(setting.id)) written.set(setting.id, setting.createdAt)
    } else if (rewritesCalendar(old, setting)) written.set(setting.id, next())
  }
}

/** Les fourches d'un carnet mené par les gestes de v2, une chance sur deux et demie par pas. */
export function forksOf(seed: number, steps: number, onFork: (fork: Fork) => void): void {
  const walk = startV2Walk(seed)
  const written = new Map<string, string>()
  const random = mulberry32(seed ^ 0x7f4a7c15)
  for (let step = 0; step < steps; step += 1) {
    const before = walk.input.settings
    v2Step(walk, () => {})
    writtenDates(before, walk.input.settings, written, () => stampOf(walk))
    if (random() > 0.4) continue
    const base: TreatmentViewInput = {
      ...walk.input,
      settings: walk.input.settings.map((setting) => {
        const at = written.get(setting.id)
        return at !== undefined && at > setting.createdAt ? { ...setting, updatedAt: at } : setting
      }),
    }
    const view = treatmentView(base)
    const current = view.currentSetting
    if (current === null || view.phase === 'stopped' || view.phase === 'ended') continue
    if (base.settings.length >= 5) continue
    const fork = forkAt(seed, step, base, random)
    if (fork !== null) onFork(fork)
  }
}

function gestureOf(base: TreatmentViewInput, random: () => number) {
  const view = treatmentView(base)
  const kind = pick(random, ['move', 'move', 'move', 'give', 'log'])!
  if (kind === 'log') {
    const due = pick(random, view.unloggedDoses)
    if (due === undefined) return null
    const status = random() < 0.7 ? 'given' : 'missed'
    return { kind: 'note', due, status, givenOn: due.dueOn, shiftsFollowing: false } as const
  }
  const choices = [
    view.currentDoses[0],
    view.currentDoses[0],
    view.nextDue,
    ...view.upcoming({ limit: 3 }),
  ]
  const due = pick(
    random,
    choices.filter((each) => each !== undefined && each !== null),
  )
  if (due === undefined || due === null) return null
  if (kind === 'give') {
    const shiftsFollowing = random() < 0.5
    return { kind: 'note', due, status: 'given', givenOn: base.today, shiftsFollowing } as const
  }
  const shiftsFollowing = random() < 0.5
  const bounds = moveBounds(base, due, shiftsFollowing)
  if ('refusal' in bounds) return null
  const last = bounds.latest ?? plusDays(bounds.earliest, 12)
  const span = Math.max(0, Math.round((Date.parse(last) - Date.parse(bounds.earliest)) / 864e5))
  return {
    kind: 'move',
    due,
    to: plusDays(bounds.earliest, int(random, 0, span)),
    shiftsFollowing,
  } as const
}

function forkAt(
  seed: number,
  step: number,
  base: TreatmentViewInput,
  random: () => number,
): Fork | null {
  const current = treatmentView(base).currentSetting!
  const view = treatmentView(base)
  const gesture = gestureOf(base, random)
  if (gesture === null) return null
  const outcome = play(base, gesture)
  if ('refusal' in outcome) return null
  const kind = pick(random, ['heures', 'heures', 'date', 'frequence', 'fin'])!
  const request: Parameters<typeof newSettings>[1] = {
    frequency: current.frequency,
    times: [...current.times],
    endsOn: current.endsOn,
  }
  if (kind === 'heures') request.times = [...pick(random, TIMES)!]
  if (kind === 'frequence') {
    request.frequency = pick(random, FREQUENCIES)!
    if (random() < 0.5) request.times = [...pick(random, TIMES)!]
  }
  if (kind === 'fin') request.endsOn = plusDays(base.today, int(random, 3, 40))
  if (kind === 'date' || random() < 0.2) {
    const days = view.upcoming({ limit: 5 }).map(({ dueOn }) => dueOn)
    const chosen = pick(random, [base.today, ...days, plusDays(base.today, int(random, 1, 6))])
    if (chosen !== undefined && (request.endsOn === null || chosen <= request.endsOn)) {
      request.firstDueOn = chosen
    }
  }
  let answer: ReturnType<typeof newSettings>
  try {
    answer = newSettings(base, request)
  } catch {
    return null
  }
  if ('refusal' in answer) return null
  const plan =
    'plan' in answer
      ? answer.plan
      : random() < 0.5 || 'refusal' in answer.question.correct
        ? answer.question.keep
        : answer.question.correct
  if ('refusal' in plan) return null
  const aFirst = random() < 0.5
  const clock = { n: 0 }
  let phoneA: TreatmentViewInput
  let phoneB: TreatmentViewInput
  if (aFirst) {
    phoneA = writeLines(base, outcome.changes, clock, 'A')
    phoneB = writePlan(base, plan, clock, 'B')
  } else {
    phoneB = writePlan(base, plan, clock, 'B')
    phoneA = writeLines(base, outcome.changes, clock, 'A')
  }
  const merged = synced(base, phoneA, phoneB)
  return { seed, step, aFirst, gesture, plan, base, phoneA, phoneB, merged }
}
