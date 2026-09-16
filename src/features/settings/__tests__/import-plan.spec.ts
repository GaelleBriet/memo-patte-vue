import { describe, expect, it } from 'vitest'

import {
  buildImportPlan,
  deletedWithItsAnimal,
  type ImportPlan,
  type ImportPlanInput,
  type LocalAnimal,
  type LocalCarnet,
  type LocalEntry,
} from '../import-plan'
import {
  CHPPIL_ID,
  IMPORT_FIXTURE,
  LUNA_ID,
  LUNA_WEIGHT_ID,
  MILBEMAX_ID,
  MILO_ID,
  MILO_WEIGHT_ID,
  TYPHUS_ID,
} from './import-fixture'

const IMPORTED_AT = '2026-09-15T10:00:00.000Z'
const LUNA_PHOTO = IMPORT_FIXTURE.animals[0]!.photoFileName!
const LUNA_UPDATED_AT = IMPORT_FIXTURE.animals[0]!.updatedAt
const EMPTY: LocalCarnet = { animals: [], vaccinations: [], treatments: [], weightEntries: [] }

function localAnimal(id: string, overrides: Partial<LocalAnimal> = {}): LocalAnimal {
  return {
    id,
    updatedAt: '2025-01-01T00:00:00.000Z',
    deletedAt: null,
    photoPath: null,
    ...overrides,
  }
}

function localEntry(id: string, animalId: string, overrides: Partial<LocalEntry> = {}): LocalEntry {
  return { id, animalId, updatedAt: '2025-01-01T00:00:00.000Z', deletedAt: null, ...overrides }
}

function buildPlan(overrides: Partial<ImportPlanInput> = {}): ImportPlan {
  const result = buildImportPlan({
    data: IMPORT_FIXTURE,
    mode: 'merge',
    local: EMPTY,
    photosOnDevice: new Set(),
    importedAt: IMPORTED_AT,
    ...overrides,
  })
  if (!result.ok) throw new Error(`Plan refusé : ${result.reattached.entity}`)
  return result.plan
}

function ids<T extends { id: string }>(writes: { row: T }[]): string[] {
  return writes.map(({ row }) => row.id)
}

describe('buildImportPlan', () => {
  it('écrit tout le fichier dans une base vide, sans effacer quoi que ce soit', () => {
    const plan = buildPlan()

    expect(plan.replaceLocalData).toBe(false)
    expect(ids(plan.animals)).toEqual([LUNA_ID, MILO_ID])
    expect(ids(plan.vaccinations)).toEqual([CHPPIL_ID, TYPHUS_ID])
    expect(ids(plan.treatments)).toEqual([MILBEMAX_ID])
    expect(ids(plan.weightEntries)).toEqual([LUNA_WEIGHT_ID, MILO_WEIGHT_ID])
    expect(plan.animals.every(({ exists }) => !exists)).toBe(true)
  })

  it('annonce l’effacement des données locales en mode remplacer', () => {
    const plan = buildPlan({ mode: 'replace' })

    expect(plan.replaceLocalData).toBe(true)
  })

  describe('arbitrage', () => {
    it('laisse gagner la version locale la plus récente', () => {
      const local = { ...EMPTY, animals: [localAnimal(LUNA_ID, { updatedAt: IMPORTED_AT })] }

      expect(ids(buildPlan({ local }).animals)).toEqual([MILO_ID])
    })

    it('à égalité, garde la version de l’appareil', () => {
      const local = { ...EMPTY, animals: [localAnimal(LUNA_ID, { updatedAt: LUNA_UPDATED_AT })] }

      expect(ids(buildPlan({ local }).animals)).toEqual([MILO_ID])
    })

    it('écrase même une version locale plus récente en mode remplacer', () => {
      const local = { ...EMPTY, animals: [localAnimal(LUNA_ID, { updatedAt: IMPORTED_AT })] }

      expect(ids(buildPlan({ local, mode: 'replace' }).animals)).toEqual([LUNA_ID, MILO_ID])
    })

    it('date de l’import une entrée déjà en base, laisse la sienne à une nouvelle', () => {
      const local = { ...EMPTY, animals: [localAnimal(MILO_ID)] }

      const plan = buildPlan({ local })

      expect(plan.animals).toEqual([
        expect.objectContaining({ exists: false, row: expect.objectContaining({ id: LUNA_ID }) }),
        expect.objectContaining({ exists: true, row: expect.objectContaining({ id: MILO_ID }) }),
      ])
      expect(plan.animals[0]!.row.updatedAt).toBe(LUNA_UPDATED_AT)
      expect(plan.animals[1]!.row.updatedAt).toBe(IMPORTED_AT)
    })
  })

  describe('rattachement figé', () => {
    it('refuse le fichier si une entrée déjà en base change d’animal', () => {
      const local = { ...EMPTY, vaccinations: [localEntry(CHPPIL_ID, LUNA_ID)] }

      const result = buildImportPlan({
        data: IMPORT_FIXTURE,
        mode: 'merge',
        local,
        photosOnDevice: new Set(),
        importedAt: IMPORTED_AT,
      })

      expect(result).toEqual({
        ok: false,
        reattached: { entity: 'vaccination', id: CHPPIL_ID },
      })
    })

    it('refuse aussi une entrée dont l’animal reste supprimé localement', () => {
      const local = {
        ...EMPTY,
        animals: [localAnimal(LUNA_ID, { deletedAt: IMPORTED_AT, updatedAt: IMPORTED_AT })],
        weightEntries: [localEntry(MILO_WEIGHT_ID, LUNA_ID)],
      }

      expect(
        buildImportPlan({
          data: IMPORT_FIXTURE,
          mode: 'merge',
          local,
          photosOnDevice: new Set(),
          importedAt: IMPORTED_AT,
        }),
      ).toMatchObject({ ok: false, reattached: { entity: 'weightEntry' } })
    })
  })

  describe('cascade de suppression', () => {
    const DELETED_WITH_LUNA = '2026-09-10T00:00:00.000Z'
    const DELETED_APART = '2026-09-11T00:00:00.000Z'

    it('reconnaît une entrée supprimée avec son animal à son `deletedAt` exact', () => {
      const cascades = new Map([[LUNA_ID, DELETED_WITH_LUNA]])

      expect(
        deletedWithItsAnimal(
          localEntry(TYPHUS_ID, LUNA_ID, { deletedAt: DELETED_WITH_LUNA }),
          cascades,
        ),
      ).toBe(true)
      expect(
        deletedWithItsAnimal(
          localEntry(TYPHUS_ID, LUNA_ID, { deletedAt: DELETED_APART }),
          cascades,
        ),
      ).toBe(false)
      expect(deletedWithItsAnimal(localEntry(TYPHUS_ID, LUNA_ID), cascades)).toBe(false)
      expect(deletedWithItsAnimal(localEntry(CHPPIL_ID, MILO_ID), cascades)).toBe(false)
    })

    it('ramène du fichier le carnet supprimé avec l’animal, pas celui supprimé à part', () => {
      const local: LocalCarnet = {
        animals: [localAnimal(LUNA_ID, { deletedAt: DELETED_WITH_LUNA })],
        vaccinations: [
          localEntry(TYPHUS_ID, LUNA_ID, { deletedAt: DELETED_WITH_LUNA, updatedAt: IMPORTED_AT }),
        ],
        treatments: [
          localEntry(MILBEMAX_ID, LUNA_ID, { deletedAt: DELETED_APART, updatedAt: IMPORTED_AT }),
        ],
        weightEntries: [],
      }

      const plan = buildPlan({ local })

      expect(ids(plan.vaccinations)).toContain(TYPHUS_ID)
      expect(ids(plan.treatments)).toEqual([])
    })

    it('n’importe pas le carnet d’un animal qui reste supprimé', () => {
      const local = {
        ...EMPTY,
        animals: [localAnimal(LUNA_ID, { deletedAt: IMPORTED_AT, updatedAt: IMPORTED_AT })],
      }

      const plan = buildPlan({ local })

      expect(ids(plan.vaccinations)).toEqual([CHPPIL_ID])
      expect(ids(plan.treatments)).toEqual([])
      expect(ids(plan.weightEntries)).toEqual([MILO_WEIGHT_ID])
    })
  })

  describe('photos', () => {
    it('reprend la photo du fichier quand elle est sur l’appareil', () => {
      const plan = buildPlan({ photosOnDevice: new Set([LUNA_PHOTO]) })

      expect(plan.animals[0]!.row.photoPath).toBe(LUNA_PHOTO)
    })

    it('garde la photo locale quand le fichier en cite une absente de l’appareil', () => {
      const local = { ...EMPTY, animals: [localAnimal(LUNA_ID, { photoPath: 'locale.jpg' })] }

      const plan = buildPlan({ local })

      expect(plan.animals[0]!.row.photoPath).toBe('locale.jpg')
    })

    it('n’attribue pas une photo déjà utilisée par un autre animal', () => {
      const local = { ...EMPTY, animals: [localAnimal(MILO_ID, { photoPath: LUNA_PHOTO })] }

      const plan = buildPlan({ local, photosOnDevice: new Set([LUNA_PHOTO]) })

      expect(plan.animals[0]!.row.photoPath).toBeNull()
    })
  })

  it('reprend l’échéance du traitement telle quelle, sans la recalculer', () => {
    const data = {
      ...IMPORT_FIXTURE,
      treatments: IMPORT_FIXTURE.treatments.map((treatment) => ({
        ...treatment,
        nextDueDate: '2027-01-31',
      })),
    }

    expect(buildPlan({ data }).treatments[0]!.row).toMatchObject({
      lastDoseDate: '2026-06-15',
      nextDueDate: '2027-01-31',
    })
  })
})
