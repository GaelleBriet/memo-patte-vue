import { describe, expect, it, vi } from 'vitest'

import { createHomeRemindersService } from '../service/home-reminders.service'
import { period, treatment, dose } from '@/features/treatments/__tests__/treatment-fixtures'
import type { TreatmentWithHistory } from '@/features/treatments/repository/treatments.repository'
import type { Vaccination } from '@/features/vaccinations/schema/vaccination.schema'

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

const METACAM = treatment(
  [period({ times: ['08:00', '20:00'] })],
  [dose('2026-09-01', '2026-09-02')],
)

function service(vaccinations: Vaccination[], treatments: TreatmentWithHistory[]) {
  return createHomeRemindersService(
    () => ({ listAll: vi.fn<() => Promise<Vaccination[]>>(async () => vaccinations) }),
    async () => ({
      listAllWithHistory: vi.fn<() => Promise<TreatmentWithHistory[]>>(async () => treatments),
    }),
  )
}

describe('homeRemindersService', () => {
  it('fusionne les vaccins et les traitements avec leur historique, que lit le moteur', async () => {
    const sources = await service([RAGE], [METACAM]).listSources()

    expect(sources).toEqual([
      {
        kind: 'vaccination',
        id: 'v1',
        animalId: 'milo',
        label: 'Rage',
        dueDate: '2026-09-01',
        lastInjectionDate: '2025-09-01',
        treatmentType: null,
      },
      {
        kind: 'treatment',
        id: 'metacam',
        animalId: 'luna',
        label: 'Métacam',
        treatmentType: 'medication',
        periods: METACAM.periods,
        doses: METACAM.doses,
      },
    ])
  })

  it('garde un vaccin jamais fait, sans date d’injection', async () => {
    const prevu: Vaccination = { ...RAGE, id: 'v3', lastInjectionDate: null }

    const sources = await service([prevu], []).listSources()

    expect(sources).toEqual([expect.objectContaining({ id: 'v3', lastInjectionDate: null })])
  })

  it('garde un vaccin sans échéance : le calcul de « À faire » décidera de ne pas le lister', async () => {
    const sources = await service([SANS_RAPPEL], []).listSources()

    expect(sources).toEqual([expect.objectContaining({ id: 'v2', dueDate: null })])
  })

  it('garde un traitement arrêté : ses doses non renseignées restent à faire', async () => {
    const arrete = treatment([period({ stoppedOn: '2026-09-05' })])

    const sources = await service([], [arrete]).listSources()

    expect(sources).toEqual([expect.objectContaining({ id: 'metacam', kind: 'treatment' })])
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
      () => ({
        listAllWithHistory: vi.fn<() => Promise<TreatmentWithHistory[]>>(async () => []),
      }),
    )

    await expect(failing.listSources()).rejects.toThrow('base indisponible')
  })
})
