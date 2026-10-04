// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createDeviceRepository } from '@/core/device/device.repository'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { toJsonExport } from '@/features/settings/logic/export-format'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createDataExportService } from '@/features/settings/service/data-export.service'
import { parseExportFile } from '@/features/settings/service/data-import.service'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'
import type { ExportData } from '@/shared/domain/carnet-data'
import { applyFixtures } from '../fixtures'

const TODAY = new Date()

describe('carnet de démo dans une vraie base', () => {
  let db: InMemoryDb
  let repositories: ReturnType<typeof createRepositories>

  function createRepositories(client: InMemoryDb) {
    return {
      animals: createAnimalsRepository(client),
      vaccinations: createVaccinationsRepository(client),
      vaccinationInjections: createVaccinationInjectionsRepository(client),
      treatments: createTreatmentsRepository(client),
      treatmentPeriods: createTreatmentPeriodsRepository(client),
      treatmentDoses: createTreatmentDosesRepository(client),
      weight: createWeightRepository(client),
    }
  }

  function carnet(): Promise<ExportData> {
    return createDataExportService({
      carnetSettings: () => createCarnetSettingsRepository(db),
      animals: () => repositories.animals,
      vaccinations: () => repositories.vaccinations,
      vaccinationInjections: () => repositories.vaccinationInjections,
      treatments: () => repositories.treatments,
      treatmentPeriods: () => repositories.treatmentPeriods,
      treatmentDoses: () => repositories.treatmentDoses,
      weight: () => repositories.weight,
      devices: () => createDeviceRepository(db),
      deliver: async () => 'shared',
      now: () => TODAY,
      appVersion: 'test',
      weightUnit: () => 'kg',
    }).collect()
  }

  beforeEach(async () => {
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    repositories = createRepositories(db)
    await applyFixtures({
      token: 'maquettes-1',
      storage: { getItem: () => null, setItem: () => undefined },
      db,
      repositories,
      today: TODAY,
    })
  })

  afterEach(() => {
    db.close()
  })

  it('s’écrit sans heurter une contrainte de la base, avec ses six traitements', async () => {
    const data = await carnet()

    expect(data.animals.map(({ name }) => name)).toEqual(['Milo', 'Luna'])
    expect(data.treatments.map(({ name }) => name).sort()).toEqual([
      'Advocate',
      'Bravecto',
      'Drontal',
      'Frontline',
      'Milbemax',
      'Panacur',
    ])
    expect(data.treatmentPeriods).toHaveLength(7)
    expect(data.treatmentDoses).toHaveLength(29)
  })

  it('s’exporte en un fichier v3 que l’import accepte : le jeu de démo est un carnet valide', async () => {
    const data = await carnet()

    const parsed = parseExportFile(toJsonExport(data, { exportedAt: TODAY, appVersion: 'test' }))

    expect(parsed).toEqual({ ok: true, file: { schemaVersion: 3, data } })
  })

  it('porte les cas du modèle : deux heures par jour, date de fin, deux périodes, oubli, report', async () => {
    const { treatments, treatmentPeriods, treatmentDoses } = await carnet()
    const periodsOf = (name: string) => {
      const treatment = treatments.find((candidate) => candidate.name === name)
      return treatmentPeriods.filter(({ treatmentId }) => treatmentId === treatment?.id)
    }

    expect(periodsOf('Panacur')).toMatchObject([
      { frequency: { value: 1, unit: 'day' }, times: ['08:00', '20:00'] },
    ])
    expect(periodsOf('Frontline')[0]?.endsOn).not.toBeNull()
    expect(periodsOf('Milbemax').map(({ stoppedOn }) => stoppedOn !== null)).toEqual([true, false])
    expect(new Set(treatmentDoses.map(({ status }) => status))).toEqual(
      new Set(['given', 'missed', 'postponed']),
    )
  })

  it('se lit dans l’app : chaque traitement avec sa période en cours et sa dernière ligne', async () => {
    const [milo, luna] = await repositories.animals.list()

    const ofMilo = await repositories.treatments.listByAnimal(milo!.id)
    const ofLuna = await repositories.treatments.listByAnimal(luna!.id)

    expect(ofMilo.map(({ name }) => name).sort()).toEqual([
      'Advocate',
      'Bravecto',
      'Drontal',
      'Panacur',
    ])
    expect(ofMilo.find(({ name }) => name === 'Advocate')?.stoppedOn).not.toBeNull()
    expect(ofLuna.find(({ name }) => name === 'Milbemax')).toMatchObject({
      stoppedOn: null,
      frequency: { value: 3, unit: 'month' },
    })
  })
})
