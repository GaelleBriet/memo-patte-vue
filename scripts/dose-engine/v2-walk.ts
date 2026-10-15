import {
  dueForDate,
  moveBounds,
  play,
  treatmentView,
  type Due,
  type Gesture,
  type GestureOutcome,
  type Line,
  type LineChange,
  type Setting,
  type SettingsPlan,
  type SettingsRequest,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { FREQUENCIES, int, mulberry32, pick, plusDays, TIMES, type Random } from './carnet'
import {
  changedSettings,
  resumed,
  settingsWritten,
  stopped,
  type SettingsWalk,
} from './v2-walk-settings'

/** Un carnet mené par les gestes du moteur v2, comme l'app le mènera (pas 3 de l'épic #758). */
export type V2Walk = {
  input: TreatmentViewInput
  stamp: number
  readonly seed: number
  readonly random: Random
  readonly log: string[]
}

/** Un pas joué : le carnet avant et après, et le geste ou le réglage accepté qui l'a changé. */
export type V2Step = {
  label: string
  before: TreatmentViewInput
  after: TreatmentViewInput
  gesture: Gesture | null
  outcome: GestureOutcome | null
  plan: SettingsPlan | null
  /** « Modifier » : la demande du formulaire qui a donné `plan`. */
  request?: SettingsRequest
}

const GESTURES = [
  'give',
  'give',
  'miss',
  'log',
  'otherDate',
  'ahead',
  'move',
  'move',
  'redate',
  'redate',
  'remove',
  'settings',
  'settings',
  'stop',
  'resume',
  'wait',
  'wait',
] as const

export function stampOf(walk: V2Walk): string {
  walk.stamp += 1
  return new Date(Date.UTC(2026, 0, 1, 0, 0, walk.stamp)).toISOString()
}

export function startV2Walk(seed: number): V2Walk {
  const random = mulberry32(seed)
  const firstDueOn = plusDays('2026-03-01', int(random, 0, 40))
  const setting: Setting = {
    id: 's1',
    startsOn: firstDueOn,
    firstDueOn,
    gridOriginOn: firstDueOn,
    firstDueChosen: true,
    pastDosesStayUnlogged: false,
    endsOn: random() < 0.3 ? plusDays(firstDueOn, int(random, 3, 60)) : null,
    stoppedOn: null,
    frequency: pick(random, FREQUENCIES)!,
    times: [...pick(random, TIMES)!],
    createdAt: '2026-01-01T00:00:00.000Z',
  }
  const today = plusDays(firstDueOn, int(random, -2, 3))
  return { input: { settings: [setting], lines: [], today }, stamp: 0, seed, random, log: [] }
}

/** Comme le repository : chaque écriture reçoit un identifiant et un horodatage plus récent. */
export function written(walk: V2Walk, changes: readonly LineChange[]): TreatmentViewInput {
  let lines: Line[] = [...walk.input.lines]
  for (const change of changes) {
    if (change.action === 'delete') {
      lines = lines.filter(({ id }) => id !== change.id)
      continue
    }
    const updatedAt = stampOf(walk)
    if (change.action === 'rewrite') {
      lines = lines.map((line) =>
        line.id === change.id ? { ...change.line, id: line.id, updatedAt } : line,
      )
    } else {
      lines = [...lines, { ...change.line, id: `l${walk.stamp}`, updatedAt }]
    }
  }
  return { ...walk.input, lines }
}

function noteGesture(walk: V2Walk, due: Due, status: 'given' | 'missed', givenOn: string): Gesture {
  return { kind: 'note', due, status, givenOn, shiftsFollowing: walk.random() < 0.65 }
}

// Le geste tiré au sort, lu sur la vue du carnet ; `null` : rien à faire ce pas-ci.
function drawGesture(walk: V2Walk, kind: (typeof GESTURES)[number]): Gesture | null {
  const { input, random } = walk
  const { today } = input
  const view = treatmentView(input)
  const lines = input.lines
  switch (kind) {
    case 'give': {
      const due = pick(random, view.currentDoses)
      if (due === undefined) return null
      return noteGesture(
        walk,
        due,
        'given',
        due.dueOn < today && random() < 0.5 ? due.dueOn : today,
      )
    }
    case 'miss': {
      const due = pick(
        random,
        view.currentDoses.filter(({ dueOn }) => dueOn <= today),
      )
      return due === undefined ? null : noteGesture(walk, due, 'missed', due.dueOn)
    }
    case 'log': {
      const due = pick(random, view.unloggedDoses)
      if (due === undefined) return null
      return noteGesture(walk, due, random() < 0.7 ? 'given' : 'missed', due.dueOn)
    }
    case 'otherDate': {
      const givenOn = plusDays(today, -int(random, 0, 8))
      const due = dueForDate(input, givenOn, pick(random, view.currentSetting?.times ?? []) ?? null)
      if (due === null || view.dueState(due) === 'given') return null
      return noteGesture(walk, due, 'given', givenOn)
    }
    case 'ahead': {
      const [due] = view.currentDoses
      if (due === undefined || due.dueOn <= today) return null
      return noteGesture(walk, due, 'given', plusDays(today, -int(random, 0, 1)))
    }
    case 'move': {
      const [current] = view.currentDoses
      const due = pick(
        random,
        [current, current, current, view.nextDue].filter(
          (item) => item !== undefined && item !== null,
        ),
      )
      if (due === undefined) return null
      const shiftsFollowing = random() >= 0.35
      const bounds = moveBounds(input, due, shiftsFollowing)
      if ('refusal' in bounds) return { kind: 'move', due, to: today, shiftsFollowing }
      const last = bounds.latest ?? plusDays(bounds.earliest, 12)
      const span = Math.max(0, Math.round((Date.parse(last) - Date.parse(bounds.earliest)) / 864e5))
      return {
        kind: 'move',
        due,
        to: plusDays(bounds.earliest, int(random, 0, span)),
        shiftsFollowing,
      }
    }
    case 'redate': {
      const line = pick(
        random,
        lines.filter(({ status }) => status === 'given' || status === 'extra'),
      )
      if (line === undefined) return null
      const givenOn = plusDays(today, -int(random, 0, 6))
      return { kind: 'redate', lineId: line.id, givenOn, shiftsFollowing: random() < 0.65 }
    }
    case 'remove': {
      const line = pick(random, lines)
      return line === undefined ? null : { kind: 'remove', lineId: line.id }
    }
    default:
      return null
  }
}

function settingsWalk(walk: V2Walk): SettingsWalk {
  return { input: walk.input, random: walk.random, log: walk.log, stamp: () => stampOf(walk) }
}

// « Modifier » (R9, R10, Q38), « Arrêter », « Reprendre » (R8) : le carnet changé, ou `null`.
function changeSettings(walk: V2Walk, kind: (typeof GESTURES)[number]): V2Step | null {
  const before = walk.input
  const settings = settingsWalk(walk)
  if (kind === 'settings') {
    const played = changedSettings(settings)
    if (played === null) return null
    walk.input = settingsWritten(settings, played.plan)
    return {
      label: walk.log.at(-1)!,
      before,
      after: walk.input,
      gesture: null,
      outcome: null,
      ...played,
    }
  }
  const after =
    kind === 'stop' ? (walk.random() < 0.3 ? stopped(settings) : null) : resumed(settings)
  if (after === null) return null
  walk.input = after
  return { label: walk.log.at(-1)!, before, after, gesture: null, outcome: null, plan: null }
}

/** Un pas : un geste tiré au sort, joué s'il est accepté ; `onStep` reçoit chaque pas qui change le carnet. */
export function v2Step(walk: V2Walk, onStep: (step: V2Step) => void): void {
  const kind = pick(walk.random, GESTURES)!
  const before = walk.input
  if (kind === 'wait') {
    walk.log.push(`${before.today} attendre`)
    walk.input = { ...before, today: plusDays(before.today, int(walk.random, 1, 4)) }
    const after = walk.input
    return onStep({ label: 'attendre', before, after, gesture: null, outcome: null, plan: null })
  }
  if (kind === 'settings' || kind === 'stop' || kind === 'resume') {
    const step = changeSettings(walk, kind)
    if (step !== null) onStep(step)
    return
  }
  const gesture = drawGesture(walk, kind)
  if (gesture === null) return
  const label = `${before.today} ${JSON.stringify(gesture)}`
  const result = play(before, gesture)
  if ('refusal' in result) {
    walk.log.push(`${label} refusé (${result.refusal.reason})`)
    return
  }
  walk.log.push(label)
  walk.input = written(walk, result.changes)
  onStep({ label, before, after: walk.input, gesture, outcome: result, plan: null })
}
