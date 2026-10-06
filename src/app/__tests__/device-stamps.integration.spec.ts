// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createCarnetSettingsRepository } from '@/features/settings/repository/carnet-settings.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

const PIXEL = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TABLETTE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

const FEATURES = 'src/features'

function repositorySources(): { path: string; source: string }[] {
  return readdirSync(FEATURES).flatMap((feature) => {
    const dir = join(FEATURES, feature, 'repository')
    let files: string[] = []
    try {
      files = readdirSync(dir).filter((file) => file.endsWith('.repository.ts'))
    } catch {
      return []
    }
    return files.map((file) => ({
      path: join(dir, file),
      source: readFileSync(join(dir, file), 'utf8'),
    }))
  })
}

/** Chaque `SET` d'une instruction : jusqu'au `WHERE`, ou jusqu'à la fin du gabarit SQL. */
function setClauses(source: string): string[] {
  return [...source.matchAll(/\bSET\b([\s\S]*?)(?:\bWHERE\b|`)/g)].map((match) => match[1] ?? '')
}

describe('appareil posé à chaque écriture', () => {
  it('toute écriture qui date une ligne nomme l’appareil qui l’écrit', () => {
    const offenders = repositorySources().flatMap(({ path, source }) =>
      setClauses(source)
        .filter((clause) => /\bupdated_at\s*=/.test(clause))
        .filter((clause) => !/\bupdated_by_device\s*=/.test(clause))
        .map((clause) => `${path} : SET${clause.trim().slice(0, 80)}`),
    )

    expect(offenders).toEqual([])
  })

  describe('dans une vraie base', () => {
    let db: InMemoryDb
    let device = PIXEL
    const deviceId = () => device

    beforeEach(async () => {
      db = await createInMemoryDb()
      await db.execute('PRAGMA foreign_keys = ON')
      device = PIXEL
    })

    afterEach(() => {
      db.close()
    })

    async function stamps(table: string, id: string) {
      const [row] = await db.query<{ created_by_device: string; updated_by_device: string }>(
        `SELECT created_by_device, updated_by_device FROM ${table} WHERE id = ?`,
        [id],
      )
      return row
    }

    it('garde l’appareil qui a créé la ligne et note celui qui l’a modifiée ou supprimée', async () => {
      const animals = createAnimalsRepository(db, { deviceId })
      const weight = createWeightRepository(db, { deviceId })
      const vaccinations = createVaccinationsRepository(db, { deviceId })
      const milo = await animals.create({ name: 'Milo', species: 'dog' })
      const pesee = await weight.create({
        animalId: milo.id,
        weightKg: 8,
        measuredOn: '2026-09-01',
      })
      const rage = await vaccinations.create({
        animalId: milo.id,
        name: 'Rage',
        lastInjectionDate: '2026-01-01',
      })

      device = TABLETTE
      await animals.update(milo.id, { name: 'Milo II', species: 'dog' })
      await weight.remove(pesee.id)
      await vaccinations.update(rage.id, { name: 'Rage', dueDate: '2027-02-01' })

      const expected = { created_by_device: PIXEL, updated_by_device: TABLETTE }
      await expect(stamps('animal', milo.id)).resolves.toEqual(expected)
      await expect(stamps('weight_entry', pesee.id)).resolves.toEqual(expected)
      await expect(stamps('vaccination', rage.id)).resolves.toEqual(expected)
      await expect(stamps('vaccination_injection', rage.id)).resolves.toEqual(expected)
    })

    it('pose l’appareil sur un traitement, sa période, ses prises et les réglages du carnet', async () => {
      const animals = createAnimalsRepository(db, { deviceId })
      const treatments = createTreatmentsRepository(db, { deviceId })
      const settings = createCarnetSettingsRepository(db, { deviceId })
      const milo = await animals.create({ name: 'Milo', species: 'dog' })
      const id = crypto.randomUUID()
      await treatments.create({
        id,
        animalId: milo.id,
        name: 'Bravecto',
        type: 'antiparasitic',
        settings: {
          startsOn: '2026-09-01',
          firstDueOn: '2026-09-01',
          endsOn: null,
          frequency: { value: 3, unit: 'month' },
          times: [],
          doseQuantity: null,
          doseUnit: null,
          reminderOffsetMinutes: null,
          reminderTime: null,
        },
        doses: [
          {
            id,
            dose: {
              periodId: id,
              dueOn: '2026-09-01',
              dueTime: null,
              givenOn: '2026-09-01',
              status: 'given',
              nextDueDate: '2026-12-01',
            },
          },
        ],
      })
      await settings.update({ vaccineReminderTime: '08:00' })

      device = TABLETTE
      await treatments.remove(id)
      await settings.update({ remindBeforeDue: false })

      const expected = { created_by_device: PIXEL, updated_by_device: TABLETTE }
      await expect(stamps('treatment', id)).resolves.toEqual(expected)
      await expect(stamps('treatment_period', id)).resolves.toEqual(expected)
      await expect(stamps('treatment_dose', id)).resolves.toEqual(expected)
      await expect(
        stamps('carnet_settings', '00000000-0000-0000-0000-000000000000'),
      ).resolves.toEqual(expected)
    })

    it('note l’appareil qui rétablit une ligne, et celui qui efface tout le carnet', async () => {
      const animals = createAnimalsRepository(db, { deviceId })
      const weight = createWeightRepository(db, { deviceId })
      const treatments = createTreatmentsRepository(db, { deviceId })
      const milo = await animals.create({ name: 'Milo', species: 'dog' })
      const pesee = await weight.create({
        animalId: milo.id,
        weightKg: 8,
        measuredOn: '2026-09-01',
      })
      const id = crypto.randomUUID()
      await treatments.create({
        id,
        animalId: milo.id,
        name: 'Bravecto',
        type: 'antiparasitic',
        settings: {
          startsOn: '2026-09-01',
          firstDueOn: '2026-09-01',
          endsOn: null,
          frequency: { value: 3, unit: 'month' },
          times: [],
          doseQuantity: null,
          doseUnit: null,
          reminderOffsetMinutes: null,
          reminderTime: null,
        },
      })
      await weight.remove(pesee.id)
      await treatments.remove(id)

      device = TABLETTE
      await weight.undoRemove(pesee.id)
      await db.runMany([
        createTreatmentPeriodsRepository(db, { deviceId }).reviveStatement(
          id,
          '2026-09-02T08:00:00.000Z',
        ),
      ])

      const expected = { created_by_device: PIXEL, updated_by_device: TABLETTE }
      await expect(stamps('weight_entry', pesee.id)).resolves.toEqual(expected)
      await expect(stamps('treatment_period', id)).resolves.toEqual(expected)

      await db.runMany([
        animals.markAllDeletedStatement('2026-09-03T08:00:00.000Z'),
        weight.markAllDeletedStatement('2026-09-03T08:00:00.000Z'),
      ])

      await expect(stamps('animal', milo.id)).resolves.toEqual(expected)
      await expect(stamps('weight_entry', pesee.id)).resolves.toEqual(expected)
    })

    it('reprend l’appareil d’une ligne tirée de la synchronisation, pas celui qui la reçoit', async () => {
      const animals = createAnimalsRepository(db, { deviceId })
      const at = '2026-09-01T08:00:00.000Z'

      await db.runMany([
        animals.applyRemoteRowStatement({
          id: 'luna',
          name: 'Luna',
          species: 'cat',
          breed: null,
          birth_date: null,
          birth_date_approximate: 0,
          photo_path: null,
          unfollowed_on: null,
          departure_reason: null,
          departure_date: null,
          created_at: at,
          updated_at: at,
          deleted_at: null,
          created_by_device: TABLETTE,
          updated_by_device: TABLETTE,
        }),
      ])

      await expect(stamps('animal', 'luna')).resolves.toEqual({
        created_by_device: TABLETTE,
        updated_by_device: TABLETTE,
      })
    })
  })
})
