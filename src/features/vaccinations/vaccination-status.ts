import { buildReminders } from '@/shared/reminders'

/** « À jour » et « En retard » disent la validité ; sans échéance, ni l'un ni l'autre n'est vrai. */
export type VaccinationStatus = 'overdue' | 'up-to-date' | 'none'

type Echeance = { id: string; name: string; dueDate: string | null }

/** Même départage que `buildReminders` : à échéance égale, l'ordre est celui de l'accueil. */
export function byDueDate(a: Echeance, b: Echeance): number {
  if (a.dueDate === null || b.dueDate === null) {
    return Number(a.dueDate === null) - Number(b.dueDate === null)
  }
  return (
    a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
  )
}

export function vaccinationStatus(dueDate: string | null, today: string): VaccinationStatus {
  if (dueDate === null) return 'none'

  const { overdue } = buildReminders(
    [{ kind: 'vaccination', id: '', animalId: '', label: '', dueDate }],
    { today },
  )
  return overdue > 0 ? 'overdue' : 'up-to-date'
}
