import { describe, expect, it, vi } from 'vitest'

import type { TreatmentsRepository } from '../repository/treatments.repository'
import { createTreatmentRemovalService } from '../service/treatment-removal.service'
import type { TreatmentRemindersService } from '../service/treatment-reminders.service'

const DELETED_AT = '2026-10-09T08:00:00.000Z'

function setup() {
  const treatments = {
    remove: vi.fn<TreatmentsRepository['remove']>().mockResolvedValue(DELETED_AT),
    restore: vi.fn<TreatmentsRepository['restore']>().mockResolvedValue(),
  }
  const reminders = {
    reschedule: vi.fn<TreatmentRemindersService['reschedule']>().mockResolvedValue(),
  }
  return {
    treatments,
    reminders,
    service: createTreatmentRemovalService({ treatments, reminders }),
  }
}

describe('createTreatmentRemovalService', () => {
  it('supprime le traitement, puis relit ses rappels, et rend l’instant de la suppression', async () => {
    const { treatments, reminders, service } = setup()

    expect(await service.remove('vermifuge')).toBe(DELETED_AT)

    expect(treatments.remove).toHaveBeenCalledExactlyOnceWith('vermifuge')
    expect(reminders.reschedule).toHaveBeenCalledExactlyOnceWith('vermifuge')
    expect(treatments.remove.mock.invocationCallOrder[0]).toBeLessThan(
      reminders.reschedule.mock.invocationCallOrder[0]!,
    )
  })

  it('ne touche pas aux rappels quand la suppression échoue', async () => {
    const { treatments, reminders, service } = setup()
    treatments.remove.mockRejectedValueOnce(new Error('base verrouillée'))

    await expect(service.remove('vermifuge')).rejects.toThrow('base verrouillée')

    expect(reminders.reschedule).not.toHaveBeenCalled()
  })

  it('rétablit le traitement à l’instant de sa suppression, puis relit ses rappels', async () => {
    const { treatments, reminders, service } = setup()

    await service.restore('vermifuge', DELETED_AT)

    expect(treatments.restore).toHaveBeenCalledExactlyOnceWith('vermifuge', DELETED_AT)
    expect(reminders.reschedule).toHaveBeenCalledExactlyOnceWith('vermifuge')
    expect(treatments.restore.mock.invocationCallOrder[0]).toBeLessThan(
      reminders.reschedule.mock.invocationCallOrder[0]!,
    )
  })

  it('ne touche pas aux rappels quand le rétablissement échoue', async () => {
    const { treatments, reminders, service } = setup()
    treatments.restore.mockRejectedValueOnce(new Error('base verrouillée'))

    await expect(service.restore('vermifuge', DELETED_AT)).rejects.toThrow('base verrouillée')

    expect(reminders.reschedule).not.toHaveBeenCalled()
  })
})
