import { buildReminders } from '@/shared/reminders'

/** « À jour » et « En retard » disent la validité ; sans échéance, ni l'un ni l'autre n'est vrai. */
export type VaccinationStatus = 'overdue' | 'up-to-date' | 'none'

export function vaccinationStatus(dueDate: string | null, today: string): VaccinationStatus {
  if (dueDate === null) return 'none'

  const { overdue } = buildReminders(
    [{ kind: 'vaccination', id: '', animalId: '', label: '', dueDate }],
    { today },
  )
  return overdue > 0 ? 'overdue' : 'up-to-date'
}
