import { describe, expect, it, vi } from 'vitest'

import type { VaccinationsRepository } from '../repository/vaccinations.repository'
import type { Vaccination } from '../schema/vaccination.schema'
import type { VaccinationRemindersService } from '../service/vaccination-reminders.service'
import { createVaccinationSaveService } from '../service/vaccination-save.service'

const RAGE = { id: 'rage', animalId: 'milo', name: 'Rage' } as Vaccination

function setup() {
  const vaccinations = {
    create: vi.fn<VaccinationsRepository['create']>().mockResolvedValue(RAGE),
    update: vi.fn<VaccinationsRepository['update']>().mockResolvedValue(RAGE),
  }
  const reminders = {
    reschedule: vi.fn<VaccinationRemindersService['reschedule']>().mockResolvedValue(),
  }
  return {
    vaccinations,
    reminders,
    service: createVaccinationSaveService({ vaccinations, reminders: () => reminders }),
  }
}

describe('createVaccinationSaveService', () => {
  it('crée le vaccin, puis programme ses rappels', async () => {
    const { vaccinations, reminders, service } = setup()
    const input = { animalId: 'milo', name: 'Rage', dueDate: '2027-03-12' }

    expect(await service.create(input)).toBe(RAGE)

    expect(vaccinations.create).toHaveBeenCalledExactlyOnceWith(input)
    expect(reminders.reschedule).toHaveBeenCalledExactlyOnceWith(RAGE.id)
    expect(vaccinations.create.mock.invocationCallOrder[0]).toBeLessThan(
      reminders.reschedule.mock.invocationCallOrder[0]!,
    )
  })

  it('modifie le vaccin, puis reprogramme ses rappels', async () => {
    const { vaccinations, reminders, service } = setup()
    const input = { name: 'Rage', dueDate: '2027-03-12' }

    expect(await service.update('rage', input)).toBe(RAGE)

    expect(vaccinations.update).toHaveBeenCalledExactlyOnceWith('rage', input)
    expect(reminders.reschedule).toHaveBeenCalledExactlyOnceWith('rage')
    expect(vaccinations.update.mock.invocationCallOrder[0]).toBeLessThan(
      reminders.reschedule.mock.invocationCallOrder[0]!,
    )
  })

  it('ne touche pas aux rappels quand l’écriture échoue', async () => {
    const { vaccinations, reminders, service } = setup()
    vaccinations.create.mockRejectedValueOnce(new Error('base verrouillée'))
    vaccinations.update.mockRejectedValueOnce(new Error('base verrouillée'))

    await expect(service.create({ animalId: 'milo', name: 'Rage', dueDate: null })).rejects.toThrow(
      'base verrouillée',
    )
    await expect(service.update('rage', { name: 'Rage', dueDate: null })).rejects.toThrow(
      'base verrouillée',
    )

    expect(reminders.reschedule).not.toHaveBeenCalled()
  })

  it('ne cherche le service des rappels qu’après l’écriture, et laisse remonter son échec', async () => {
    const { vaccinations } = setup()
    const reminders = vi.fn<() => Pick<VaccinationRemindersService, 'reschedule'>>(() => {
      expect(vaccinations.update).toHaveBeenCalled()
      throw new Error('rappels absents')
    })
    const service = createVaccinationSaveService({ vaccinations, reminders })

    await expect(service.update('rage', { name: 'Rage', dueDate: null })).rejects.toThrow(
      'rappels absents',
    )

    expect(reminders).toHaveBeenCalledOnce()
  })
})
