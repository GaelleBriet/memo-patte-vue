import { treatmentView, type Line, type TreatmentViewInput } from '@/shared/domain/dose-calendar'

import { dueKey } from './display'
import { calendarOf, compare, firstDayOf, horizonOf, type Broken } from './v2-reading'
import type { V2Step } from './v2-walk'

const isNote = ({ status }: Pick<Line, 'status'>) =>
  status === 'given' || status === 'missed' || status === 'extra'

/** 1. R11 : la lecture garde chaque ligne ; un geste ne touche que les lignes qu'il vise. */
export function conservation(step: V2Step): Broken | null {
  const view = treatmentView(step.after)
  if (view.history.length !== step.after.lines.length) {
    return { invariant: 'conservation', detail: 'une ligne manque à l’historique' }
  }
  if (step.gesture === null || step.outcome === null) return null
  const gesture = step.gesture
  const content = ({ settingId, dueOn, dueTime, status, givenOn, targetOn }: Line) =>
    JSON.stringify([settingId, dueOn, dueTime, status, givenOn, targetOn])
  const touched = step.outcome.changes.flatMap((change) => {
    if (change.action === 'create') return []
    const line = step.before.lines.find(({ id }) => id === change.id)!
    const now = step.after.lines.find(({ id }) => id === change.id)
    return now !== undefined && content(now) === content(line) ? [] : [line]
  })
  const becomesPrise = (line: Line) =>
    'givenOn' in gesture &&
    step.after.lines.some(
      (now) => now.id === line.id && now.status === 'given' && now.givenOn === gesture.givenOn,
    )
  // TR-25 : « Supprimer » la prise en vigueur emporte les autres lignes de sa dose, jour et heure.
  const ofRemovedDose = (line: Line) => {
    if (gesture.kind !== 'remove') return false
    const removed = step.before.lines.find(({ id }) => id === gesture.lineId)!
    const inForce =
      treatmentView(step.before).history.find(({ line: { id } }) => id === removed.id)?.effect
        .kind !== 'idle'
    return (
      inForce &&
      isNote(removed) &&
      isNote(line) &&
      line.dueOn === removed.dueOn &&
      line.dueTime === removed.dueTime
    )
  }
  const followed = new Set(step.outcome.followed.map(({ from }) => from))
  // G12, #786 : le report seul que la prise notée fait suivre est réécrit.
  const follows = (line: Line) => line.status === 'postponed' && followed.has(line.targetOn ?? '')
  const allowed = (line: Line) => {
    if (gesture.kind === 'remove') return line.id === gesture.lineId || ofRemovedDose(line)
    if (!isNote(line)) return gesture.kind !== 'note' || line.status === 'shift' || follows(line)
    if (becomesPrise(line)) return true
    return gesture.kind === 'redate' && line.id === gesture.lineId
  }
  const foreign = touched.filter((line) => !allowed(line))
  return foreign.length === 0
    ? null
    : { invariant: 'conservation', detail: `lignes touchées : ${JSON.stringify(foreign)}` }
}

/** 2. Pas de double : une échéance par clé, une prise par échéance, jamais deux fois la même à donner. */
export function noDouble(input: TreatmentViewInput): Broken | null {
  const view = treatmentView(input)
  const until = horizonOf(input)
  const slots = view.slots(firstDayOf(input), until).map(({ due }) => dueKey(due))
  const unlogged = view.unloggedDoses.map(dueKey)
  const ahead = [...view.currentDoses, ...view.upcoming({ to: until })].map(dueKey)
  const pending = unlogged.filter((key) => ahead.includes(key))
  const covered = view.history.flatMap(({ effect }) =>
    effect.kind === 'covers' ? [effect.key] : [],
  )
  const twice = (keys: string[]) => keys.filter((key, index) => keys.indexOf(key) !== index)
  const most = Math.max(...input.settings.map(({ times }) => Math.max(1, times.length)))
  const crowded = slots
    .map((key) => key.slice(0, 10))
    .filter((day, _, all) => all.filter((each) => each === day).length > most)
  const found = [
    ...twice(slots),
    ...twice(covered),
    ...twice(unlogged),
    ...twice(view.upcoming({ to: until }).map(dueKey)),
    ...pending,
    ...crowded,
  ]
  return found.length === 0 ? null : { invariant: 'pas de double', detail: JSON.stringify(found) }
}

/** 6. « Annuler » : les écritures inverses rendent la lecture d'avant. */
export function undo(step: V2Step): Broken | null {
  if (step.outcome === null) return null
  const before = new Map(step.before.lines.map((line) => [line.id, line]))
  const lines = [
    ...step.after.lines.filter((line) => before.has(line.id)).map((line) => before.get(line.id)!),
    ...step.before.lines.filter((line) => !step.after.lines.some(({ id }) => id === line.id)),
  ]
  const until = horizonOf(step.before)
  const read = (input: TreatmentViewInput) => calendarOf(treatmentView(input), input, until)
  return compare('annuler', read(step.before), read({ ...step.after, lines }))
}
