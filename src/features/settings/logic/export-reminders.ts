import { outlookDueDate, treatmentOutlooks } from '@/shared/domain/treatment-outlook'
import type { ExportData } from '@/shared/domain/carnet-data'
import { vaccinationHeads } from '@/shared/domain/carnet-heads'

export type ExportReminder = {
  kind: 'vaccination' | 'treatment'
  sourceId: string
  animalId: string
  name: string
  dueDate: string
}

/** `today` : `yyyy-MM-dd`, jour de l'export ; les échéances des traitements viennent du moteur. */
export function exportReminders(data: ExportData, today: string): ExportReminder[] {
  const injections = vaccinationHeads(data.vaccinationInjections)
  const outlook = treatmentOutlooks(data, today)
  const reminders: ExportReminder[] = [
    ...data.vaccinations.flatMap((vaccination): ExportReminder[] => {
      const head = injections.get(vaccination.id)
      const dueDate = head ? head.nextDueDate : vaccination.plannedDueDate
      return dueDate
        ? [
            {
              kind: 'vaccination',
              sourceId: vaccination.id,
              animalId: vaccination.animalId,
              name: vaccination.name,
              dueDate,
            },
          ]
        : []
    }),
    ...data.treatments.flatMap((treatment): ExportReminder[] => {
      const dueDate = outlookDueDate(outlook(treatment.id))
      return dueDate
        ? [
            {
              kind: 'treatment',
              sourceId: treatment.id,
              animalId: treatment.animalId,
              name: treatment.name,
              dueDate,
            },
          ]
        : []
    }),
  ]
  return reminders.sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name),
  )
}
