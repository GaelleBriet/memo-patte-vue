import { treatmentView, type Line, type TreatmentViewInput } from '@/shared/domain/dose-calendar'

import { dueKey } from './display'
import { calendarOf, compare, firstDayOf, horizonOf, type Broken } from './v2-reading'
import type { V2Step } from './v2-walk'

const isNote = ({ status }: Pick<Line, 'status'>) =>
  status === 'given' || status === 'missed' || status === 'extra'

const isPrise = ({ status }: Pick<Line, 'status'>) => status === 'given' || status === 'missed'

const familyOf = (line: Line) => (isPrise(line) ? 'note' : line.status)

/** R8 : un arrêt clôt une période ; les réglages dans l'ordre de leur écriture. */
function periodsOf(input: TreatmentViewInput): (settingId: string) => number {
  const ordered = [...input.settings].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const periods = new Map<string, number>()
  let period = 0
  for (const setting of ordered) {
    periods.set(setting.id, period)
    if (setting.stoppedOn !== null) period += 1
  }
  return (settingId) => periods.get(settingId) ?? -1
}

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
  const periodOf = periodsOf(step.before)
  const deleted = (line: Line) => !step.after.lines.some(({ id }) => id === line.id)
  const sameDose = (line: Line, of: Pick<Line, 'settingId' | 'dueOn' | 'dueTime'>) =>
    deleted(line) &&
    periodOf(line.settingId) === periodOf(of.settingId) &&
    line.dueOn === of.dueOn &&
    line.dueTime === of.dueTime
  const arrivalLogged = (report: Line) =>
    step.before.lines.some((other) => isPrise(other) && other.dueOn === report.targetOn)
  // TR-25, #835 : « Supprimer » une ligne en vigueur emporte les autres lignes que la fiche montre
  // avec elle : prises de sa dose ; reports de sa dose dont l'arrivée n'est pas notée (Q25) et
  // décalages de sa journée.
  const ofRemovedLine = (line: Line) => {
    if (gesture.kind !== 'remove') return false
    const removed = step.before.lines.find(({ id }) => id === gesture.lineId)!
    const inForce =
      treatmentView(step.before).history.find(({ line: { id } }) => id === removed.id)?.effect
        .kind !== 'idle'
    if (!inForce) return false
    if (line.status === 'shift' && ['postponed', 'shift'].includes(removed.status)) {
      return sameDose(line, { ...removed, dueTime: line.dueTime })
    }
    if (line.status === 'postponed' && arrivalLogged(line)) return false
    return familyOf(line) === familyOf(removed) && sameDose(line, removed)
  }
  // TR-25, #841 : la prise notée ou corrigée retire les autres prises de sa dose.
  const ofNotedDose = (line: Line) => {
    if (!isPrise(line)) return false
    if (gesture.kind === 'note') return sameDose(line, gesture.due)
    if (gesture.kind !== 'redate') return false
    return sameDose(
      line,
      step.before.lines.find(({ id }) => id === gesture.lineId)!,
    )
  }
  const followed = new Set(step.outcome.followed.map(({ from }) => from))
  // G12, #786 : le report seul que la prise notée fait suivre est réécrit.
  const follows = (line: Line) => line.status === 'postponed' && followed.has(line.targetOn ?? '')
  const allowed = (line: Line) => {
    if (gesture.kind === 'remove') return line.id === gesture.lineId || ofRemovedLine(line)
    if (ofNotedDose(line)) return true
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
  // R7 : un jour d'arrivée garde ses doses et y ajoute celles qui arrivent.
  const arriving = (day: string) =>
    view.history.reduce(
      (count, { effect }) =>
        effect.kind === 'moves' && effect.arrival === day ? count + effect.keys.length : count,
      0,
    )
  const crowded = slots
    .map((key) => key.slice(0, 10))
    .filter((day, _, all) => all.filter((each) => each === day).length > most + arriving(day))
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
