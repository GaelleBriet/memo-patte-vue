import { createWriteQueue, type WriteQueue } from '@/core/write-queue/treatment-write-queue'
import type { TreatmentRemover } from '../repository/treatments.repository'
import type { TreatmentRemindersService } from './treatment-reminders.service'

export type TreatmentRemovalDependencies = {
  treatments: TreatmentRemover
  reminders: () => Pick<TreatmentRemindersService, 'reschedule'>
  queue?: WriteQueue
}

export function createTreatmentRemovalService({
  treatments,
  reminders,
  queue = createWriteQueue(),
}: TreatmentRemovalDependencies) {
  async function removed(id: string): Promise<string> {
    const deletedAt = await treatments.remove(id)
    await reminders().reschedule(id)
    return deletedAt
  }

  async function restored(id: string, deletedAt: string): Promise<void> {
    await treatments.restore(id, deletedAt)
    await reminders().reschedule(id)
  }

  return {
    /** Rend l'instant de la suppression, à passer à `restore`. */
    remove(id: string): Promise<string> {
      return queue(() => removed(id))
    },

    restore(id: string, deletedAt: string): Promise<void> {
      return queue(() => restored(id, deletedAt))
    },
  }
}
