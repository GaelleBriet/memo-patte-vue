import { describe, expect, it, vi } from 'vitest'

import type { VaccinationsRepository } from '../repository/vaccinations.repository'
import { createVaccinationRemovalService } from '../service/vaccination-removal.service'
import type { VaccinationRemindersService } from '../service/vaccination-reminders.service'

const DELETED_AT = '2026-10-09T08:00:00.000Z'

function setup() {
  const vaccinations = {
    remove: vi.fn<VaccinationsRepository['remove']>().mockResolvedValue(DELETED_AT),
    restore: vi.fn<VaccinationsRepository['restore']>().mockResolvedValue(),
  }
  const reminders = {
    reschedule: vi.fn<VaccinationRemindersService['reschedule']>().mockResolvedValue(),
  }
  return {
    vaccinations,
    reminders,
    service: createVaccinationRemovalService({ vaccinations, reminders }),
  }
}

describe('createVaccinationRemovalService', () => {
  it('supprime le vaccin, puis relit ses rappels, et rend l’instant de la suppression', async () => {
    const { vaccinations, reminders, service } = setup()

    expect(await service.remove('rage')).toBe(DELETED_AT)

    expect(vaccinations.remove).toHaveBeenCalledExactlyOnceWith('rage')
    expect(reminders.reschedule).toHaveBeenCalledExactlyOnceWith('rage')
    expect(vaccinations.remove.mock.invocationCallOrder[0]).toBeLessThan(
      reminders.reschedule.mock.invocationCallOrder[0]!,
    )
  })

  it('ne touche pas aux rappels quand la suppression échoue', async () => {
    const { vaccinations, reminders, service } = setup()
    vaccinations.remove.mockRejectedValueOnce(new Error('base verrouillée'))

    await expect(service.remove('rage')).rejects.toThrow('base verrouillée')

    expect(reminders.reschedule).not.toHaveBeenCalled()
  })

  it('rétablit le vaccin à l’instant de sa suppression, puis relit ses rappels', async () => {
    const { vaccinations, reminders, service } = setup()

    await service.restore('rage', DELETED_AT)

    expect(vaccinations.restore).toHaveBeenCalledExactlyOnceWith('rage', DELETED_AT)
    expect(reminders.reschedule).toHaveBeenCalledExactlyOnceWith('rage')
    expect(vaccinations.restore.mock.invocationCallOrder[0]).toBeLessThan(
      reminders.reschedule.mock.invocationCallOrder[0]!,
    )
  })

  it('ne touche pas aux rappels quand le rétablissement échoue', async () => {
    const { vaccinations, reminders, service } = setup()
    vaccinations.restore.mockRejectedValueOnce(new Error('base verrouillée'))

    await expect(service.restore('rage', DELETED_AT)).rejects.toThrow('base verrouillée')

    expect(reminders.reschedule).not.toHaveBeenCalled()
  })
})
