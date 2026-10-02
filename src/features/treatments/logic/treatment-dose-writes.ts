import type { DoseWrite } from '../repository/treatment-doses.repository'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type {
  DoseFields,
  DoseGesture,
  Due,
  MovedDose,
  TreatmentSchedule,
} from '@/shared/domain/treatment-schedule'

export type DoseAction =
  | { kind: 'note'; gesture: DoseGesture }
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
}

type History = Pick<TreatmentWithHistory, 'id' | 'animalId' | 'doses'>

function isSameDue(a: Due, b: Due): boolean {
  return a.periodId === b.periodId && a.dueOn === b.dueOn && a.dueTime === b.dueTime
}

function linesOf({ doses }: History, due: Due): NewTreatmentDose[] {
  return doses.filter((dose) => isSameDue(dose, due))
}

function lineById({ doses }: History, id: string): NewTreatmentDose {
  const line = doses.find((dose) => dose.id === id)
  if (line === undefined) throw new Error(`Prise introuvable : ${id}`)
  return line
}

/** La dose d'une ligne « Reportée » ou « Avancée », à sa nouvelle date. */
export function movedDueOf(
  line: Pick<NewTreatmentDose, 'periodId' | 'dueTime' | 'nextDueDate'>,
): Due {
  return { periodId: line.periodId, dueOn: line.nextDueDate, dueTime: line.dueTime }
}

function rewrites(lines: NewTreatmentDose[], dose: DoseFields): DoseWrite[] {
  return lines.map(({ id }) => ({ action: 'rewrite', id, dose }))
}

function deletes(ids: readonly string[]): DoseWrite[] {
  return ids.map((id) => ({ action: 'delete', id }))
}

function movedWrites(history: History, moved: MovedDose, newId: () => string): DoseWrite[] {
  switch (moved.action) {
    case 'create':
      return [
        {
          action: 'create',
          id: newId(),
          treatmentId: history.id,
          animalId: history.animalId,
          dose: moved.dose,
        },
      ]
    case 'rewrite':
      return [{ action: 'rewrite', id: moved.doseId, dose: moved.dose }]
    case 'delete':
      return deletes([moved.doseId])
    case 'none':
      return []
  }
}

function withoutStale(writes: DoseWrite[], schedule: TreatmentSchedule): DoseWrite[] {
  if (writes.length === 0) return writes
  const touched = new Set(writes.map(({ id }) => id))
  return [...writes, ...deletes(schedule.staleDoseIds.filter((id) => !touched.has(id)))]
}

function changeOf(
  history: History,
  schedule: TreatmentSchedule,
  action: DoseAction,
  newId: () => string,
): DoseChange {
  const unchanged = { alreadyGivenOn: null, postponement: null }
  switch (action.kind) {
    case 'note': {
      const { gesture } = action
      const noted = schedule.doses.find((dose) => isSameDue(dose, gesture.due))
      if (gesture.kind === 'given' && noted?.status === 'given') {
        return { writes: [], alreadyGivenOn: noted.givenOn, postponement: null }
      }
      const dose = schedule.doseFor(gesture)
      const lines = linesOf(history, gesture.due)
      const created: DoseWrite = {
        action: 'create',
        id: newId(),
        treatmentId: history.id,
        animalId: history.animalId,
        dose,
      }
      return { ...unchanged, writes: lines.length === 0 ? [created] : rewrites(lines, dose) }
    }
    case 'remove':
      return {
        ...unchanged,
        writes: deletes(linesOf(history, lineById(history, action.doseId)).map(({ id }) => id)),
      }
    case 'redate': {
      const { dose, postponement } = schedule.redate(action.doseId, action.givenOn)
      const writes = rewrites(linesOf(history, lineById(history, action.doseId)), dose)
      if (postponement === null) return { ...unchanged, writes }
      if (!postponement.kept) {
        return {
          writes: [...writes, ...deletes(postponement.doseIds)],
          alreadyGivenOn: null,
          postponement: { kept: false },
        }
      }
      const { line } = postponement
      return {
        writes: [
          ...writes,
          ...postponement.doseIds.map((id): DoseWrite => ({ action: 'rewrite', id, dose: line })),
        ],
        alreadyGivenOn: null,
        postponement: { kept: true, nextDueDate: line.nextDueDate },
      }
    }
    case 'move': {
      const moved = schedule.move(movedDueOf(lineById(history, action.doseId)), action.to)
      return { ...unchanged, writes: movedWrites(history, moved, newId) }
    }
    case 'remove-move':
      return {
        ...unchanged,
        writes: movedWrites(history, schedule.removeMove(action.doseId), newId),
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
