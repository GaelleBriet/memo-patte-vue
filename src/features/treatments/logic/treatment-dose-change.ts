import { doseWritesOf } from './treatment-dose-writes'
import { revealedDues, type RevealedDues } from './treatment-revealed-dues'
import type { KeptAhead } from './treatment-undo-order'
import type { DoseWrite } from '../schema/treatment-dose.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import {
  applied,
  keptAhead,
  play,
  treatmentView,
  type Due,
  type DueState,
  type FollowedReport,
  type Gesture,
  type GestureOutcome,
  type LineChange,
  type LineFields,
  type Refusal,
  type TreatmentView,
} from '@/shared/domain/dose-calendar'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'

export type NoteGesture = Extract<Gesture, { kind: 'note' }>

export type DoseAction =
  /** `heldBy` : l'arrivée du report seul que le décalage de cette prise ferait passer ; la suite ne bouge pas. */
  | { kind: 'note'; gesture: NoteGesture; heldBy?: string }
  /** Doses à renseigner, écrites en un seul lot ; lève `DoseAlreadyLoggedError` si l'une est déjà notée. */
  | { kind: 'log'; gestures: readonly NoteGesture[] }
  /** Une prise, une prise en plus, un report ou un décalage : le moteur dit ce qui reste. */
  | { kind: 'remove'; lineId: string }
  | { kind: 'redate'; lineId: string; givenOn: string; shiftsFollowing: boolean }
  | { kind: 'move'; due: Due; to: string; shiftsFollowing: boolean }

export type DoseChange = {
  writes: DoseWrite[]
  /** Date d'une prise déjà donnée pour cette échéance : rien n'est écrit. */
  alreadyGivenOn: string | null
  /** G20, Q4 : les journées que le décalage fait sortir de la date de fin. */
  lostToEnd: string[]
  /** G19 : les reports seuls que la correction a fait suivre. */
  followed: FollowedReport[]
  /** Le report tel qu'écrit, ou `removed` ; `null` hors du geste « Prochaine dose » ou sans changement. */
  moved: LineFields | 'removed' | null
  /** La prise, le report ou la ligne supprimés laissent un décalage en place (N6). */
  shiftKept: boolean
  /** Le report qui garde la suite en place (G19, G20) : son arrivée. */
  heldBy?: string
  /** G21 : les doses passées que le geste fait apparaître, à renseigner ou en retard. */
  revealed: RevealedDues | null
  /** R12, #842 : les lignes que « Annuler » doit laisser devant les lignes supprimées. */
  keptAhead?: KeptAhead
}

export class DoseAlreadyLoggedError extends Error {}

export class GestureRefusedError extends Error {
  constructor(readonly refusal: Refusal) {
    super(`Geste refusé : ${refusal.reason}`)
  }
}

type TreatmentToWrite = Pick<TreatmentWithHistory, 'id' | 'animalId' | 'doses'>

const NONE = {
  alreadyGivenOn: null,
  lostToEnd: [],
  followed: [],
  moved: null,
  shiftKept: false,
  revealed: null,
} satisfies Omit<DoseChange, 'writes'>

function played({ input }: TreatmentReading, gesture: Gesture): GestureOutcome {
  const result = play(input, gesture)
  if ('refusal' in result) throw new GestureRefusedError(result.refusal)
  return result
}

// N6, G18 : le décalage d'une dose avancée est posé sur la journée d'origine de son report.
export function keepsShift({ view, input }: TreatmentReading, line: { dueOn: string }): boolean {
  const origins = view.history.flatMap(({ line: report, effect }) =>
    report.status === 'postponed' && effect.kind === 'moves' && report.targetOn === line.dueOn
      ? [report.dueOn]
      : [],
  )
  const days = new Set([line.dueOn, ...origins])
  return input.lines.some(({ status, dueOn }) => status === 'shift' && days.has(dueOn))
}

function revealedBy(reading: TreatmentReading, outcome: GestureOutcome): RevealedDues | null {
  const after = treatmentView(applied(reading.input, outcome.changes))
  const revealed = revealedDues(reading.view, after, reading.input.today)
  return revealed.unlogged.length + revealed.overdue.length === 0 ? null : revealed
}

function movedOf(changes: GestureOutcome['changes']): DoseChange['moved'] {
  for (const change of changes) {
    if (change.action !== 'delete' && change.line.status === 'postponed') return change.line
  }
  return changes.some((change) => change.action === 'delete') ? 'removed' : null
}

// TR-25, #931 : la ligne de ce téléphone, grisée, que la note remet en tête de sa dose.
function greyedRewrites({ view }: TreatmentReading, changes: readonly LineChange[]): Set<string> {
  const idle = new Set(
    view.history.flatMap(({ line, effect }) => (effect.kind === 'idle' ? [line.id] : [])),
  )
  return new Set(
    changes.flatMap((change) =>
      change.action === 'rewrite' && idle.has(change.id) ? [change.id] : [],
    ),
  )
}

function noteChange(
  treatment: TreatmentToWrite,
  reading: TreatmentReading,
  gesture: NoteGesture,
  heldBy: string | undefined,
  newId: () => string,
): DoseChange {
  if (gesture.status === 'given') {
    const alreadyGivenOn = reading.view.alreadyNotedOn(gesture.due, gesture.givenOn)
    if (alreadyGivenOn !== null) return { ...NONE, writes: [], alreadyGivenOn }
  }
  const outcome = played(reading, gesture)
  const wasGiven = reading.view.dueState(gesture.due) === 'given'
  const greyed = greyedRewrites(reading, outcome.changes)
  const ahead = keptAhead(reading.input, [...greyed])
  const touched = reading.input.lines.filter(({ id }) => greyed.has(id))
  return {
    ...NONE,
    writes: doseWritesOf(treatment, outcome.changes, newId, greyed),
    lostToEnd: outcome.lostToEnd,
    shiftKept: gesture.status === 'missed' && wasGiven && keepsShift(reading, gesture.due),
    revealed: gesture.status === 'given' ? revealedBy(reading, outcome) : null,
    ...(heldBy === undefined ? {} : { heldBy }),
    ...(ahead.length === 0 ? {} : { keptAhead: { touched, ahead } }),
  }
}

const dueKey = ({ dueOn, dueTime }: Pick<Due, 'dueOn' | 'dueTime'>) => `${dueOn} ${dueTime ?? ''}`

const isOnItsDay = ({ due, givenOn }: NoteGesture) => givenOn === due.dueOn

function stateOf(view: TreatmentView, dues: readonly Due[]): Map<string, DueState> {
  const days = dues.map(({ dueOn }) => dueOn).sort()
  const slots = days.length === 0 ? [] : view.slots(days[0]!, days.at(-1)!)
  return new Map(slots.map(({ due, state }) => [dueKey(due), state]))
}

// Chaque dose a sa ligne, à son jour : une seule lecture du carnet pour tout le lot, sinon un geste après l'autre.
function logChange(
  treatment: TreatmentToWrite,
  reading: TreatmentReading,
  gestures: readonly NoteGesture[],
  newId: () => string,
): DoseChange {
  const states = stateOf(
    reading.view,
    gestures.map(({ due }) => due),
  )
  const logged = gestures.find(({ due }) => (states.get(dueKey(due)) ?? 'pending') !== 'pending')
  if (logged !== undefined) {
    throw new DoseAlreadyLoggedError(`Dose déjà notée : ${logged.due.dueOn} ${logged.due.dueTime}`)
  }
  if (gestures.some(({ due }) => !states.has(dueKey(due)))) {
    throw new GestureRefusedError({ reason: 'unknown-due' })
  }
  if (!gestures.every(isOnItsDay)) {
    const changes = gestures.flatMap((gesture) => played(reading, gesture).changes)
    return { ...NONE, writes: doseWritesOf(treatment, changes, newId) }
  }
  const changes = gestures.map(({ due, status }): LineChange => ({
    action: 'create',
    line: {
      settingId: due.settingId,
      dueOn: due.dueOn,
      dueTime: due.dueTime,
      status,
      givenOn: status === 'given' ? due.dueOn : null,
      targetOn: null,
    },
  }))
  return { ...NONE, writes: doseWritesOf(treatment, changes, newId) }
}

/** Écritures d'un geste sur les prises, jouées par le moteur ; lève quand il le refuse. */
export function doseChange(
  treatment: TreatmentToWrite,
  reading: TreatmentReading,
  action: DoseAction,
  newId: () => string,
): DoseChange {
  switch (action.kind) {
    case 'note':
      return noteChange(treatment, reading, action.gesture, action.heldBy, newId)
    case 'log':
      return logChange(treatment, reading, action.gestures, newId)
    case 'remove': {
      const line = reading.input.lines.find(({ id }) => id === action.lineId)
      if (line === undefined) throw new Error(`Prise introuvable : ${action.lineId}`)
      const outcome = played(reading, { kind: 'remove', lineId: action.lineId })
      const input = applied(reading.input, outcome.changes)
      const after = { input, view: treatmentView(input) }
      const deletedIds = outcome.changes.flatMap((change) =>
        change.action === 'delete' ? [change.id] : [],
      )
      const ahead = keptAhead(reading.input, deletedIds)
      const touched = reading.input.lines.filter(({ id }) => deletedIds.includes(id))
      return {
        ...NONE,
        writes: doseWritesOf(treatment, outcome.changes, newId),
        shiftKept: line.status !== 'extra' && line.status !== 'shift' && keepsShift(after, line),
        ...(ahead.length === 0 ? {} : { keptAhead: { touched, ahead } }),
      }
    }
    case 'redate': {
      const { lineId, givenOn, shiftsFollowing } = action
      const outcome = played(reading, { kind: 'redate', lineId, givenOn, shiftsFollowing })
      return {
        ...NONE,
        writes: doseWritesOf(treatment, outcome.changes, newId),
        lostToEnd: outcome.lostToEnd,
        followed: outcome.followed,
        revealed: revealedBy(reading, outcome),
      }
    }
    case 'move': {
      const outcome = played(reading, {
        kind: 'move',
        due: action.due,
        to: action.to,
        shiftsFollowing: action.shiftsFollowing,
      })
      return {
        ...NONE,
        writes: doseWritesOf(treatment, outcome.changes, newId),
        lostToEnd: outcome.lostToEnd,
        moved: movedOf(outcome.changes),
      }
    }
  }
}
