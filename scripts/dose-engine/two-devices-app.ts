import {
  doseChange,
  type DoseChange,
  type NoteGesture,
} from '@/features/treatments/logic/treatment-dose-change'
import { doseFieldsOf } from '@/features/treatments/logic/treatment-dose-writes'
import { undoKeepingAhead, undoRanks } from '@/features/treatments/logic/treatment-undo-order'
import type { DoseFields, DoseWrite } from '@/features/treatments/schema/treatment-dose.schema'
import type { TreatmentWithPeriods } from '@/features/treatments/schema/treatment-with-periods.schema'
import type { Line, LineFields, TreatmentViewInput } from '@/shared/domain/dose-calendar'
import { readCarnet } from '@/shared/domain/treatment-reading'

/** Une ligne du téléphone : la décision que le moteur lit, et la dernière écriture que la synchro compare. */
export type PhoneLine = Line & { updatedAt: string }

/** Le carnet d'un téléphone : ses lignes visibles, et celles qu'il a supprimées (pour « Annuler »). */
export type Phone = { device: string; lines: PhoneLine[]; deleted: Map<string, PhoneLine> }

export type Clock = { n: number }

const LATER = Date.UTC(2027, 5, 1)

function stamp(clock: Clock): string {
  clock.n += 1
  return new Date(LATER + clock.n * 1000).toISOString()
}

const lineFieldsOf = (dose: DoseFields): LineFields => ({
  settingId: dose.periodId,
  dueOn: dose.dueOn,
  dueTime: dose.dueTime,
  status: dose.status,
  givenOn: dose.givenOn,
  targetOn: dose.targetOn,
  ...(dose.status === 'postponed'
    ? {
        previousTargetOn: dose.previousTargetOn,
        previousTargetTime: dose.previousTargetTime,
        dueRank: dose.dueRank,
      }
    : {}),
})

// Ce que `doseWritesOf` lit du traitement : ses prises et les heures de ses réglages.
function treatmentOf(
  lines: readonly PhoneLine[],
  settings: TreatmentViewInput['settings'],
): Pick<TreatmentWithPeriods, 'id' | 'animalId' | 'doses' | 'periods'> {
  const doses = lines.map((line) => ({
    id: line.id,
    ...doseFieldsOf(line),
    updatedAt: line.updatedAt,
  }))
  const periods = settings.map(({ id, times }) => ({ id, times: [...times] }))
  return {
    id: 't',
    animalId: 'a',
    doses: doses as unknown as TreatmentWithPeriods['doses'],
    periods: periods as unknown as TreatmentWithPeriods['periods'],
  }
}

/**
 * Comme `applyBatch` : chaque écriture datée de l'instant du lot, décidée à cet instant
 * sauf une réécriture du lot inverse, qui remet la décision d'avant ; et le lot inverse.
 */
export function applyBatch(phone: Phone, writes: readonly DoseWrite[], clock: Clock): DoseWrite[] {
  if (writes.length === 0) return []
  const at = stamp(clock)
  const rankOf = undoRanks(
    [...phone.lines, ...phone.deleted.values()].filter((line) =>
      writes.some((write) => write.action !== 'create' && write.id === line.id),
    ),
  )
  const inverse: DoseWrite[] = []
  for (const write of writes) {
    if (write.action === 'create') {
      const line = { ...lineFieldsOf(write.dose), id: write.id, updatedAt: at, decidedAt: at }
      phone.lines.push({ ...line, createdByDevice: phone.device })
      inverse.push({ action: 'delete', id: write.id, expectedUpdatedAt: at })
      continue
    }
    if (write.action === 'restore') {
      const line = phone.deleted.get(write.id)!
      phone.deleted.delete(write.id)
      phone.lines.push({ ...line, updatedAt: at })
      inverse.push({ action: 'delete', id: write.id, expectedUpdatedAt: at })
      continue
    }
    const old = phone.lines.find(({ id }) => id === write.id)
    if (old === undefined) throw new Error(`Prise introuvable : ${write.id}`)
    if (write.expectedUpdatedAt !== undefined && old.updatedAt !== write.expectedUpdatedAt) {
      throw new Error(`Prise modifiée depuis : ${write.id}`)
    }
    phone.lines = phone.lines.filter(({ id }) => id !== write.id)
    if (write.action === 'delete') {
      phone.deleted.set(write.id, old)
      inverse.push({
        action: 'restore',
        id: write.id,
        expectedUpdatedAt: at,
        rank: rankOf(write.id),
      })
      continue
    }
    const decidedAt = write.decidedAt ?? at
    phone.lines.push({ ...old, ...lineFieldsOf(write.dose), updatedAt: at, decidedAt })
    inverse.push({
      action: 'rewrite',
      id: write.id,
      dose: doseFieldsOf(old),
      expectedUpdatedAt: at,
      rank: rankOf(write.id),
      decidedAt: old.decidedAt,
    })
  }
  return inverse.reverse()
}

/** Le geste joué comme par le service : écritures du moteur, lot inverse et « Annuler » ; `null` si refusé. */
export function noteByApp(
  phone: Phone,
  base: TreatmentViewInput,
  gesture: NoteGesture,
  clock: Clock,
): { change: DoseChange; undo: DoseWrite[] } | null {
  const reading = readCarnet({ ...base, lines: phone.lines, device: phone.device })
  if (reading === null) return null
  let ids = 0
  let change: DoseChange
  try {
    change = doseChange(
      treatmentOf(phone.lines, base.settings),
      reading,
      { kind: 'note', gesture },
      () => {
        ids += 1
        return `${phone.device}-${clock.n}-${ids}`
      },
    )
  } catch {
    return null
  }
  const inverse = applyBatch(phone, change.writes, clock)
  const undo =
    change.keptAhead === undefined ? inverse : undoKeepingAhead(inverse, change.keptAhead)
  return { change, undo }
}
