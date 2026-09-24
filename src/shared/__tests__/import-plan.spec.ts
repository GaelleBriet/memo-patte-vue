import { describe, expect, it } from 'vitest'

import {
  buildImportPlan,
  deletedWithItsAnimal,
  type ImportPlan,
  type ImportPlanInput,
  type LocalAnimal,
  type LocalCarnet,
  type LocalDose,
  type LocalEntry,
  type LocalInjection,
} from '../domain/import-plan'
import type { ExportData } from '../domain/carnet-data'
import {
  CHPPIL_ID,
  IMPORT_FIXTURE,
  LUNA_ID,
  LUNA_WEIGHT_ID,
  MILBEMAX_ID,
  MILO_ID,
  MILO_WEIGHT_ID,
  TYPHUS_ID,
} from '@/features/settings/__tests__/import-fixture'

const IMPORTED_AT = '2026-09-15T10:00:00.000Z'
const LUNA_PHOTO = IMPORT_FIXTURE.animals[0]!.photoFileName!
const LUNA_UPDATED_AT = IMPORT_FIXTURE.animals[0]!.updatedAt
const NEW_ID = 'identifiant-neuf'
const EMPTY: LocalCarnet = {
  animals: [],
  vaccinations: [],
  vaccinationInjections: [],
  treatments: [],
  treatmentDoses: [],
  weightEntries: [],
}

function localInjection(
  id: string,
  injectedOn: string,
  overrides: Partial<LocalInjection> = {},
): LocalInjection {
  return {
    id,
    vaccinationId: CHPPIL_ID,
    injectedOn,
    updatedAt: '2025-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

function localDose(id: string, givenOn: string, overrides: Partial<LocalDose> = {}): LocalDose {
  return {
    id,
    treatmentId: MILBEMAX_ID,
    givenOn,
    updatedAt: '2025-01-01T00:00:00.000Z',
    deletedAt: null,
    ...overrides,
  }
}

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
    newId: () => NEW_ID,
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
        newId: () => NEW_ID,
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
          newId: () => NEW_ID,
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
        ...EMPTY,
        animals: [localAnimal(LUNA_ID, { deletedAt: DELETED_WITH_LUNA })],
        vaccinations: [
          localEntry(TYPHUS_ID, LUNA_ID, { deletedAt: DELETED_WITH_LUNA, updatedAt: IMPORTED_AT }),
        ],
        treatments: [
          localEntry(MILBEMAX_ID, LUNA_ID, { deletedAt: DELETED_APART, updatedAt: IMPORTED_AT }),
        ],
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

  describe('injections d’un fichier v1', () => {
    const chppil = IMPORT_FIXTURE.vaccinations[0]!
    const FILE_DATE = chppil.lastInjectionDate
    const OLDER = '2024-09-01'
    const localChppil = { ...EMPTY, vaccinations: [localEntry(CHPPIL_ID, MILO_ID)] }

    function chppilInjections(plan: ImportPlan) {
      return plan.vaccinationInjections.filter(({ row }) => row.vaccinationId === CHPPIL_ID)
    }

    it('appareil vierge : crée chaque injection avec l’identifiant de son vaccin', () => {
      const typhus = IMPORT_FIXTURE.vaccinations[1]!

      expect(buildPlan().vaccinationInjections).toEqual([
        {
          row: {
            id: CHPPIL_ID,
            vaccinationId: CHPPIL_ID,
            animalId: MILO_ID,
            injectedOn: FILE_DATE,
            nextDueDate: chppil.dueDate,
            createdAt: chppil.createdAt,
            updatedAt: chppil.updatedAt,
          },
          exists: false,
        },
        {
          row: {
            id: TYPHUS_ID,
            vaccinationId: TYPHUS_ID,
            animalId: LUNA_ID,
            injectedOn: typhus.lastInjectionDate,
            nextDueDate: null,
            createdAt: typhus.createdAt,
            updatedAt: typhus.updatedAt,
          },
          exists: false,
        },
      ])
    })

    it('met à jour l’injection locale de même date, jamais la date d’une autre', () => {
      const local = {
        ...localChppil,
        vaccinationInjections: [
          localInjection(CHPPIL_ID, OLDER),
          localInjection('recente', FILE_DATE),
        ],
      }

      expect(chppilInjections(buildPlan({ local }))).toEqual([
        {
          row: expect.objectContaining({
            id: 'recente',
            injectedOn: FILE_DATE,
            nextDueDate: chppil.dueDate,
            updatedAt: IMPORTED_AT,
          }),
          exists: true,
        },
      ])
    })

    it('crée une injection neuve pour une date absente, sans reprendre l’identifiant déjà pris', () => {
      const local = { ...localChppil, vaccinationInjections: [localInjection(CHPPIL_ID, OLDER)] }

      expect(chppilInjections(buildPlan({ local }))).toEqual([
        {
          row: expect.objectContaining({ id: NEW_ID, injectedOn: FILE_DATE }),
          exists: false,
        },
      ])
    })

    it('n’écrit rien sur une injection de même date plus récente sur l’appareil', () => {
      const local = {
        ...localChppil,
        vaccinationInjections: [
          localInjection(CHPPIL_ID, FILE_DATE, { updatedAt: '2026-06-01T00:00:00.000Z' }),
        ],
      }

      expect(chppilInjections(buildPlan({ local }))).toEqual([])
    })

    it('préfère, à date égale, l’injection non supprimée', () => {
      const local = {
        ...localChppil,
        vaccinationInjections: [
          localInjection('supprimee', FILE_DATE, { deletedAt: '2025-06-01T00:00:00.000Z' }),
          localInjection('vivante', FILE_DATE),
        ],
      }

      expect(chppilInjections(buildPlan({ local })).map(({ row }) => row.id)).toEqual(['vivante'])
    })

    describe('vaccin revenu avec son animal', () => {
      const CASCADE = '2026-09-10T00:00:00.000Z'
      const CANCELLED = '2026-09-05T00:00:00.000Z'
      const miloAfterCascade: ExportData = {
        ...IMPORT_FIXTURE,
        animals: IMPORT_FIXTURE.animals.map((animal) =>
          animal.id === MILO_ID ? { ...animal, updatedAt: '2026-09-12T00:00:00.000Z' } : animal,
        ),
      }
      const withParent = { deletedAt: CASCADE, updatedAt: CASCADE }

      function cascadeWith(vaccinationInjections: LocalInjection[]): LocalCarnet {
        return {
          ...EMPTY,
          animals: [localAnimal(MILO_ID, withParent)],
          vaccinations: [localEntry(CHPPIL_ID, MILO_ID, withParent)],
          vaccinationInjections,
        }
      }

      it('ramène les injections supprimées avec le vaccin, pas celle du fichier annulée avant', () => {
        const local = cascadeWith([
          localInjection('e1', OLDER, withParent),
          localInjection('e0', FILE_DATE, { deletedAt: CANCELLED, updatedAt: CANCELLED }),
        ])

        const plan = buildPlan({ data: miloAfterCascade, local })

        expect(chppilInjections(plan)).toEqual([])
        expect(plan.revivedInjections).toEqual(['e1'])
      })

      it('ne ramène pas une injection d’une autre date supprimée seule avant la cascade', () => {
        const local = cascadeWith([
          localInjection('e1', OLDER, withParent),
          localInjection('seule', '2023-09-01', {
            deletedAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
          }),
        ])

        const plan = buildPlan({ data: miloAfterCascade, local })

        expect(plan.revivedInjections).toEqual(['e1'])
      })

      it('ramène l’injection de même date supprimée avec le vaccin, sans réécrire son rappel', () => {
        const local = cascadeWith([localInjection(CHPPIL_ID, FILE_DATE, withParent)])

        const plan = buildPlan({ data: miloAfterCascade, local })

        expect(chppilInjections(plan)).toEqual([])
        expect(plan.revivedInjections).toEqual([CHPPIL_ID])
      })

      it('à date égale, retient l’injection supprimée avec le vaccin, puis la plus récente', () => {
        const fileNewer: ExportData = {
          ...miloAfterCascade,
          vaccinations: miloAfterCascade.vaccinations.map((vaccination) => ({
            ...vaccination,
            updatedAt: '2026-09-11T00:00:00.000Z',
          })),
        }
        const deletedOn = (day: string) => ({
          deletedAt: `2026-09-0${day}T00:00:00.000Z`,
          updatedAt: `2026-09-0${day}T00:00:00.000Z`,
        })
        const chosen = (local: LocalCarnet) => {
          const plan = buildPlan({ data: fileNewer, local })
          return [chppilInjections(plan).map(({ row }) => row.id), plan.revivedInjections]
        }

        expect(
          chosen(
            cascadeWith([
              localInjection('seule-recente', FILE_DATE, deletedOn('8')),
              localInjection('avec-vaccin', FILE_DATE, withParent),
            ]),
          ),
        ).toEqual([['avec-vaccin'], []])
        expect(
          chosen(
            cascadeWith([
              localInjection('ancienne', FILE_DATE, deletedOn('1')),
              localInjection('recente', FILE_DATE, deletedOn('8')),
            ]),
          ),
        ).toEqual([['recente'], []])
      })

      it('en remplacement, n’écrit que l’injection du fichier', () => {
        const local = cascadeWith([
          localInjection('e1', OLDER, withParent),
          localInjection('e0', FILE_DATE, { deletedAt: CANCELLED, updatedAt: CANCELLED }),
        ])

        const plan = buildPlan({ data: miloAfterCascade, local, mode: 'replace' })

        expect(chppilInjections(plan)).toEqual([
          { row: expect.objectContaining({ id: 'e0', injectedOn: FILE_DATE }), exists: true },
        ])
        expect(plan.revivedInjections).toEqual([])
      })
    })

    it('en remplacement, restaure l’injection du fichier même plus récente sur l’appareil', () => {
      const local = {
        ...localChppil,
        vaccinationInjections: [
          localInjection(CHPPIL_ID, OLDER),
          localInjection('recente', FILE_DATE, { updatedAt: '2026-06-01T00:00:00.000Z' }),
        ],
      }

      expect(chppilInjections(buildPlan({ local, mode: 'replace' }))).toEqual([
        { row: expect.objectContaining({ id: 'recente', injectedOn: FILE_DATE }), exists: true },
      ])
    })

    it('n’écrit aucune injection pour un vaccin que le plan n’écrit pas', () => {
      const local = {
        ...EMPTY,
        animals: [localAnimal(LUNA_ID, { deletedAt: IMPORTED_AT, updatedAt: IMPORTED_AT })],
      }

      const plan = buildPlan({ local })

      expect(plan.vaccinationInjections.map(({ row }) => row.id)).toEqual([CHPPIL_ID])
    })
  })

  describe('prises d’un fichier v1', () => {
    const milbemax = IMPORT_FIXTURE.treatments[0]!
    const FILE_DATE = milbemax.lastDoseDate
    const OLDER = '2026-03-15'
    const localMilbemax = { ...EMPTY, treatments: [localEntry(MILBEMAX_ID, LUNA_ID)] }

    it('appareil vierge : crée la prise avec l’identifiant de son traitement, fréquence recopiée', () => {
      expect(buildPlan().treatmentDoses).toEqual([
        {
          row: {
            id: MILBEMAX_ID,
            treatmentId: MILBEMAX_ID,
            animalId: LUNA_ID,
            givenOn: FILE_DATE,
            nextDueDate: milbemax.nextDueDate,
            frequency: milbemax.frequency,
            createdAt: milbemax.createdAt,
            updatedAt: milbemax.updatedAt,
          },
          exists: false,
        },
      ])
    })

    it('met à jour la prise locale de même date, échéance et fréquence comprises', () => {
      const local = {
        ...localMilbemax,
        treatmentDoses: [localDose(MILBEMAX_ID, OLDER), localDose('recente', FILE_DATE)],
      }

      expect(buildPlan({ local }).treatmentDoses).toEqual([
        {
          row: expect.objectContaining({
            id: 'recente',
            givenOn: FILE_DATE,
            nextDueDate: milbemax.nextDueDate,
            frequency: milbemax.frequency,
            updatedAt: IMPORTED_AT,
          }),
          exists: true,
        },
      ])
    })

    it('crée une prise neuve pour une date absente, sans reprendre l’identifiant déjà pris', () => {
      const local = { ...localMilbemax, treatmentDoses: [localDose(MILBEMAX_ID, OLDER)] }

      expect(buildPlan({ local }).treatmentDoses).toEqual([
        { row: expect.objectContaining({ id: NEW_ID, givenOn: FILE_DATE }), exists: false },
      ])
    })

    it('n’écrit rien sur une prise de même date plus récente sur l’appareil', () => {
      const local = {
        ...localMilbemax,
        treatmentDoses: [
          localDose(MILBEMAX_ID, FILE_DATE, { updatedAt: '2026-07-01T00:00:00.000Z' }),
        ],
      }

      expect(buildPlan({ local }).treatmentDoses).toEqual([])
    })

    it('en remplacement, restaure la prise du fichier même plus récente sur l’appareil', () => {
      const local = {
        ...localMilbemax,
        treatmentDoses: [
          localDose(MILBEMAX_ID, FILE_DATE, { updatedAt: '2026-07-01T00:00:00.000Z' }),
        ],
      }

      expect(buildPlan({ local, mode: 'replace' }).treatmentDoses).toEqual([
        { row: expect.objectContaining({ id: MILBEMAX_ID, givenOn: FILE_DATE }), exists: true },
      ])
    })

    describe('traitement revenu avec son animal', () => {
      const CASCADE = '2026-09-10T00:00:00.000Z'
      const withParent = { deletedAt: CASCADE, updatedAt: CASCADE }
      const cancelled = {
        deletedAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-05T00:00:00.000Z',
      }
      const lunaAfterCascade: ExportData = {
        ...IMPORT_FIXTURE,
        animals: IMPORT_FIXTURE.animals.map((animal) =>
          animal.id === LUNA_ID ? { ...animal, updatedAt: '2026-09-12T00:00:00.000Z' } : animal,
        ),
      }

      function cascadeWith(treatmentDoses: LocalDose[]): LocalCarnet {
        return {
          ...EMPTY,
          animals: [localAnimal(LUNA_ID, withParent)],
          treatments: [localEntry(MILBEMAX_ID, LUNA_ID, withParent)],
          treatmentDoses,
        }
      }

      it('ramène les prises supprimées avec le traitement, pas celle du fichier annulée avant', () => {
        const local = cascadeWith([
          localDose('d1', OLDER, withParent),
          localDose('d0', FILE_DATE, cancelled),
        ])

        const plan = buildPlan({ data: lunaAfterCascade, local })

        expect(plan.treatmentDoses).toEqual([])
        expect(plan.revivedDoses).toEqual(['d1'])
      })

      it('ne ramène pas une prise d’une autre date supprimée seule avant la cascade', () => {
        const local = cascadeWith([
          localDose('d1', OLDER, withParent),
          localDose('seule', '2026-01-15', cancelled),
        ])

        expect(buildPlan({ data: lunaAfterCascade, local }).revivedDoses).toEqual(['d1'])
      })

      it('en remplacement, n’écrit que la prise du fichier', () => {
        const local = cascadeWith([
          localDose('d1', OLDER, withParent),
          localDose('d0', FILE_DATE, cancelled),
        ])

        const plan = buildPlan({ data: lunaAfterCascade, local, mode: 'replace' })

        expect(plan.treatmentDoses).toEqual([
          { row: expect.objectContaining({ id: 'd0', givenOn: FILE_DATE }), exists: true },
        ])
        expect(plan.revivedDoses).toEqual([])
      })
    })

    it('n’écrit aucune prise pour un traitement que le plan n’écrit pas', () => {
      const local = {
        ...EMPTY,
        animals: [localAnimal(LUNA_ID, { deletedAt: IMPORTED_AT, updatedAt: IMPORTED_AT })],
      }

      expect(buildPlan({ local }).treatmentDoses).toEqual([])
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
