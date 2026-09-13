import { describe, expect, it, vi } from 'vitest'

import { createHomeRemindersService } from '../home-reminders.service'
import type { Treatment } from '@/features/treatments/treatment.schema'
import type { Vaccination } from '@/features/vaccinations/vaccination.schema'

const STAMPS = {
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

const RAGE: Vaccination = {
  id: 'v1',
  animalId: 'milo',
  name: 'Rage',
  lastInjectionDate: '2025-09-01',
  dueDate: '2026-09-01',
  ...STAMPS,
}

const SANS_RAPPEL: Vaccination = { ...RAGE, id: 'v2', dueDate: null }

const BRAVECTO: Treatment = {
  id: 't1',
  animalId: 'luna',
  name: 'Bravecto',
  type: 'antiparasitic',
  frequency: { value: 3, unit: 'month' },
  lastDoseDate: '2026-06-24',
  nextDueDate: '2026-09-24',
  ...STAMPS,
}

function service(vaccinations: Vaccination[], treatments: Treatment[]) {
  return createHomeRemindersService(
    () => ({ listAll: vi.fn<() => Promise<Vaccination[]>>(async () => vaccinations) }),
    async () => ({ listAll: vi.fn<() => Promise<Treatment[]>>(async () => treatments) }),
  )
}

describe('homeRemindersService', () => {
  it('fusionne vaccins et traitements en sources de rappel', async () => {
    const sources = await service([RAGE], [BRAVECTO]).listSources()

    expect(sources).toEqual([
      {
        kind: 'vaccination',
        id: 'v1',
        animalId: 'milo',
        label: 'Rage',
        dueDate: '2026-09-01',
        treatmentType: null,
      },
      {
        kind: 'treatment',
        id: 't1',
        animalId: 'luna',
        label: 'Bravecto',
        dueDate: '2026-09-24',
        treatmentType: 'antiparasitic',
      },
    ])
  })

  it('garde un vaccin sans échéance : buildReminders décidera de ne pas le lister', async () => {
    const sources = await service([SANS_RAPPEL], []).listSources()

    expect(sources).toEqual([expect.objectContaining({ id: 'v2', dueDate: null })])
  })

  it('renvoie une liste vide sans aucune donnée', async () => {
    await expect(service([], []).listSources()).resolves.toEqual([])
  })

  it('propage l’échec d’un repository', async () => {
    const failing = createHomeRemindersService(
      () => ({
        listAll: vi.fn<() => Promise<Vaccination[]>>(() =>
          Promise.reject(new Error('base indisponible')),
        ),
      }),
      () => ({ listAll: vi.fn<() => Promise<Treatment[]>>(async () => []) }),
    )

    await expect(failing.listSources()).rejects.toThrow('base indisponible')
  })
})
