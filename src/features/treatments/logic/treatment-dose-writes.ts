import type { DoseWrite } from '../repository/treatment-doses.repository'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import {
  familyOf,
  type DoseFields,
  type DoseGesture,
  type Due,
  type Family,
  type LineChange,
  type MovedDose,
  type NotedDose,
  type TreatmentSchedule,
} from '@/shared/domain/treatment-schedule'

export type DoseAction =
  | { kind: 'note'; gesture: DoseGesture }
  /** Doses à renseigner, écrites en un seul lot ; lève `DoseAlreadyLoggedError` si l'une est déjà notée. */
  | { kind: 'log'; gestures: readonly DoseGesture[] }
  | { kind: 'remove'; doseId: string }
  | { kind: 'redate'; doseId: string; givenOn: string }
  | { kind: 'move'; doseId: string; to: string }
  | { kind: 'remove-move'; doseId: string }

export type DoseChange = {
  writes: DoseWrite[]
  /** Date d'une prise déjà donnée pour cette échéance : rien n'est écrit. */
  alreadyGivenOn: string | null
  /** Déplacement qui suivait une prise redatée : gardé à sa date, ou perdu. */
  postponement: { kept: true; nextDueDate: string } | { kept: false } | null
  /** Ce qu'un geste sur un report en a fait : sa ligne telle qu'écrite, ou `removed` ; `null` hors de ces gestes ou sans changement. */
  moved: DoseFields | 'removed' | null
  /** La prise supprimée ou marquée oubliée, ou le report supprimé, laisse sa ligne de décalage (N6). */
  shiftKept: boolean
}

export class DoseAlreadyLoggedError extends Error {}

type History = Pick<TreatmentWithHistory, 'id' | 'animalId' | 'doses'>

function isSameDue(a: Due, b: Due): boolean {
  return a.periodId === b.periodId && a.dueOn === b.dueOn && a.dueTime === b.dueTime
}

// TR-25 : les lignes d'une même échéance et d'une même famille (deux appareils) se corrigent ensemble.
function linesOf({ doses }: History, due: Due, family: Family): NewTreatmentDose[] {
  return doses.filter((dose) => isSameDue(dose, due) && familyOf(dose) === family)
}

function lineById({ doses }: History, id: string): NewTreatmentDose {
  const line = doses.find((dose) => dose.id === id)
  if (line === undefined) throw new Error(`Prise introuvable : ${id}`)
  return line
}

function sisterLines(history: History, id: string): NewTreatmentDose[] {
  const line = lineById(history, id)
  return linesOf(history, line, familyOf(line))
}

/** La dose d'une ligne « Reportée » ou « Avancée », à sa nouvelle date. */
export function movedDueOf(
  line: Pick<NewTreatmentDose, 'periodId' | 'dueTime' | 'nextDueDate'>,
): Due {
  return { periodId: line.periodId, dueOn: line.nextDueDate, dueTime: line.dueTime }
}

function hasFields(line: NewTreatmentDose, dose: DoseFields): boolean {
  return (
    isSameDue(line, dose) &&
    line.givenOn === dose.givenOn &&
    line.status === dose.status &&
    line.nextDueDate === dose.nextDueDate
  )
}

function rewrites(lines: NewTreatmentDose[], dose: DoseFields): DoseWrite[] {
  return lines
    .filter((line) => !hasFields(line, dose))
    .map(({ id }) => ({ action: 'rewrite', id, dose }))
}

function deletes(ids: readonly string[]): DoseWrite[] {
  return ids.map((id) => ({ action: 'delete', id }))
}

function sistersOf(history: History, id: string): string[] {
  return sisterLines(history, id)
    .filter((other) => other.id !== id)
    .map((other) => other.id)
}

function created(history: History, dose: DoseFields, newId: () => string): DoseWrite {
  return {
    action: 'create',
    id: newId(),
    treatmentId: history.id,
    animalId: history.animalId,
    dose,
  }
}

function lineWrites(history: History, change: LineChange, newId: () => string): DoseWrite[] {
  switch (change.action) {
    case 'create':
      return [created(history, change.dose, newId)]
    case 'rewrite':
      return [
        { action: 'rewrite', id: change.doseId, dose: change.dose },
        ...deletes(sistersOf(history, change.doseId)),
      ]
    case 'delete':
      return deletes([change.doseId, ...sistersOf(history, change.doseId)])
    case 'none':
      return []
  }
}

function movedChange(
  history: History,
  { report, shift }: MovedDose,
  newId: () => string,
): Pick<DoseChange, 'writes' | 'moved'> {
  return {
    writes: [...lineWrites(history, report, newId), ...lineWrites(history, shift, newId)],
    moved: report.action === 'none' ? null : report.action === 'delete' ? 'removed' : report.dose,
  }
}

function withoutStale(writes: DoseWrite[], schedule: TreatmentSchedule): DoseWrite[] {
  if (writes.length === 0) return writes
  const unique = writes.filter(
    (write, index) =>
      write.action === 'create' || writes.findIndex(({ id }) => id === write.id) === index,
  )
  const touched = new Set(unique.map(({ id }) => id))
  return [...unique, ...deletes(schedule.staleDoseIds.filter((id) => !touched.has(id)))]
}

// Écrit sur les lignes de la même famille, ou en crée une.
function familyWrites(
  history: History,
  dose: DoseFields,
  lines: NewTreatmentDose[],
  newId: () => string,
): DoseWrite[] {
  return lines.length > 0 ? rewrites(lines, dose) : [created(history, dose, newId)]
}

// Une prise en plus est rangée sous sa date réelle, avec les lignes de sa famille.
function noteWrites(
  history: History,
  { dose, shift }: NotedDose,
  notes: NewTreatmentDose[],
  newId: () => string,
): DoseWrite[] {
  const lines = familyOf(dose) === 'note' ? notes : linesOf(history, dose, familyOf(dose))
  const writes = familyWrites(history, dose, lines, newId)
  if (shift === null) return writes
  return [...writes, ...familyWrites(history, shift, linesOf(history, shift, 'shift'), newId)]
}

function dueKey({ periodId, dueOn, dueTime }: Due): string {
  return `${periodId} ${dueOn} ${dueTime ?? ''}`
}

function logWrites(
  history: History,
  schedule: TreatmentSchedule,
  gestures: readonly DoseGesture[],
  newId: () => string,
): DoseWrite[] {
  const noted = new Set(schedule.doses.filter((dose) => familyOf(dose) === 'note').map(dueKey))
  const logged = gestures.find(({ due }) => noted.has(dueKey(due)))
  if (logged !== undefined) {
    throw new DoseAlreadyLoggedError(`Dose déjà notée : ${dueKey(logged.due)}`)
  }
  const notesOfDue = new Map<string, NewTreatmentDose[]>()
  for (const line of history.doses.filter((dose) => familyOf(dose) === 'note')) {
    notesOfDue.set(dueKey(line), [...(notesOfDue.get(dueKey(line)) ?? []), line])
  }
  return gestures.flatMap((gesture) =>
    noteWrites(
      history,
      schedule.doseFor(gesture),
      notesOfDue.get(dueKey(gesture.due)) ?? [],
      newId,
    ),
  )
}

function keepsShift(history: History, id: string): boolean {
  const line = lineById(history, id)
  return familyOf(line) !== 'extra' && linesOf(history, line, 'shift').length > 0
}

// Redatée, une prise en plus prend la place d'une ligne de l'échéance qu'elle vise désormais, ou
// garde la sienne.
function extraRedateWrites(
  history: History,
  schedule: TreatmentSchedule,
  { doseId, givenOn }: { doseId: string; givenOn: string },
  newId: () => string,
): DoseWrite[] {
  const { dose, shift } = schedule.redate(doseId, givenOn)
  const extras = sisterLines(history, doseId)
  const targets = linesOf(history, dose, familyOf(dose)).filter((line) => !extras.includes(line))
  const lines =
    targets.length > 0
      ? [...rewrites(targets, dose), ...deletes(extras.map(({ id }) => id))]
      : rewrites(extras, dose)
  return [...lines, ...lineWrites(history, shift, newId)]
}

function changeOf(
  history: History,
  schedule: TreatmentSchedule,
  action: DoseAction,
  newId: () => string,
): DoseChange {
  const unchanged = { alreadyGivenOn: null, postponement: null, moved: null, shiftKept: false }
  switch (action.kind) {
    case 'note': {
      const { gesture } = action
      const noted = schedule.doses.find(
        (dose) => isSameDue(dose, gesture.due) && familyOf(dose) === 'note',
      )
      if (gesture.kind === 'given' && noted?.status === 'given') {
        return { ...unchanged, writes: [], alreadyGivenOn: noted.givenOn }
      }
      const written = schedule.doseFor(gesture)
      const isRepeated =
        familyOf(written.dose) === 'extra' &&
        schedule.doses.some((dose) => familyOf(dose) === 'extra' && isSameDue(dose, written.dose))
      if (isRepeated) return { ...unchanged, writes: [], alreadyGivenOn: written.dose.givenOn }
      const notes = linesOf(history, gesture.due, 'note')
      return {
        ...unchanged,
        writes: noteWrites(history, written, notes, newId),
        shiftKept:
          gesture.kind === 'missed' &&
          notes.length > 0 &&
          linesOf(history, gesture.due, 'shift').length > 0,
      }
    }
    case 'log':
      return { ...unchanged, writes: logWrites(history, schedule, action.gestures, newId) }
    case 'remove':
      return {
        ...unchanged,
        writes: deletes(sisterLines(history, action.doseId).map(({ id }) => id)),
        shiftKept: keepsShift(history, action.doseId),
      }
    case 'redate': {
      if (familyOf(lineById(history, action.doseId)) === 'extra') {
        return { ...unchanged, writes: extraRedateWrites(history, schedule, action, newId) }
      }
      const { dose, shift, postponement } = schedule.redate(action.doseId, action.givenOn)
      const writes = [
        ...rewrites(sisterLines(history, action.doseId), dose),
        ...lineWrites(history, shift, newId),
      ]
      if (postponement === null) return { ...unchanged, writes }
      if (!postponement.kept) {
        const lost = postponement.doseIds.flatMap((id) => [id, ...sistersOf(history, id)])
        return {
          ...unchanged,
          writes: [...writes, ...deletes([...new Set(lost)])],
          postponement: { kept: false },
        }
      }
      const kept = (ids: string[], line: DoseFields) =>
        ids.flatMap((id): DoseWrite[] => [
          { action: 'rewrite', id, dose: line },
          ...deletes(sistersOf(history, id).filter((other) => !ids.includes(other))),
        ])
      return {
        ...unchanged,
        writes: [
          ...writes,
          ...kept(postponement.doseIds, postponement.line),
          ...kept(postponement.shiftIds, postponement.shiftLine),
        ],
        postponement: { kept: true, nextDueDate: postponement.line.nextDueDate },
      }
    }
    case 'move': {
      const moved = schedule.move(movedDueOf(lineById(history, action.doseId)), action.to)
      return { ...unchanged, ...movedChange(history, moved, newId) }
    }
    case 'remove-move':
      return {
        ...unchanged,
        ...movedChange(history, schedule.removeMove(action.doseId), newId),
        shiftKept: keepsShift(history, action.doseId),
      }
  }
}

/** Écritures d'un geste sur les prises, calculées par le moteur ; lève quand il le refuse. */
export function doseChange(
  history: History,
  schedule: TreatmentSchedule,
  action: DoseAction,
  newId: () => string,
): DoseChange {
  const change = changeOf(history, schedule, action, newId)
  return { ...change, writes: withoutStale(change.writes, schedule) }
}
