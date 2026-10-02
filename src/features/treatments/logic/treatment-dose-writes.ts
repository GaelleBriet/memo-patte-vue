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
  /** Ce qu'un geste sur un report en a fait : sa ligne telle qu'écrite, ou `removed` ; `null` hors de ces gestes ou sans changement. */
  moved: DoseFields | 'removed' | null
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

function otherMovesOf(history: History, id: string): string[] {
  const line = history.doses.find((dose) => dose.id === id)
  if (line === undefined) return []
  return linesOf(history, line)
    .filter((other) => other.status === 'postponed' && other.id !== id)
    .map((other) => other.id)
}

function movedChange(
  history: History,
  moved: MovedDose,
  newId: () => string,
): Pick<DoseChange, 'writes' | 'moved'> {
  switch (moved.action) {
    case 'create':
      return {
        writes: [
          {
            action: 'create',
            id: newId(),
            treatmentId: history.id,
            animalId: history.animalId,
            dose: moved.dose,
          },
        ],
        moved: moved.dose,
      }
    case 'rewrite':
      return {
        writes: [
          { action: 'rewrite', id: moved.doseId, dose: moved.dose },
          ...deletes(otherMovesOf(history, moved.doseId)),
        ],
        moved: moved.dose,
      }
    case 'delete':
      return {
        writes: deletes([moved.doseId, ...otherMovesOf(history, moved.doseId)]),
        moved: 'removed',
      }
    case 'none':
      return { writes: [], moved: null }
  }
}

function withoutStale(writes: DoseWrite[], schedule: TreatmentSchedule): DoseWrite[] {
  if (writes.length === 0) return writes
  const unique = writes.filter(
    (write, index) => writes.findIndex(({ id }) => id === write.id) === index,
  )
  const touched = new Set(unique.map(({ id }) => id))
  return [...unique, ...deletes(schedule.staleDoseIds.filter((id) => !touched.has(id)))]
}

function changeOf(
  history: History,
  schedule: TreatmentSchedule,
  action: DoseAction,
  newId: () => string,
): DoseChange {
  const unchanged = { alreadyGivenOn: null, postponement: null, moved: null }
  switch (action.kind) {
    case 'note': {
      const { gesture } = action
      const noted = schedule.doses.find((dose) => isSameDue(dose, gesture.due))
      if (gesture.kind === 'given' && noted?.status === 'given') {
        return { ...unchanged, writes: [], alreadyGivenOn: noted.givenOn }
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
      const others = postponement.doseIds.flatMap((id) => otherMovesOf(history, id))
      if (!postponement.kept) {
        return {
          ...unchanged,
          writes: [...writes, ...deletes([...postponement.doseIds, ...others])],
          postponement: { kept: false },
        }
      }
      const { line } = postponement
      return {
        ...unchanged,
        writes: [
          ...writes,
          ...postponement.doseIds.map((id): DoseWrite => ({ action: 'rewrite', id, dose: line })),
          ...deletes(others.filter((id) => !postponement.doseIds.includes(id))),
        ],
        postponement: { kept: true, nextDueDate: line.nextDueDate },
      }
    }
    case 'move': {
      const moved = schedule.move(movedDueOf(lineById(history, action.doseId)), action.to)
      return { ...unchanged, ...movedChange(history, moved, newId) }
    }
    case 'remove-move':
      return { ...unchanged, ...movedChange(history, schedule.removeMove(action.doseId), newId) }
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
