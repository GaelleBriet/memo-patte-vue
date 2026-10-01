import { describe, expect, it } from 'vitest'

import {
  buildImportPlan,
  deletedWithItsAnimal,
  deletedWithItsParent,
  type ImportPlan,
  type ImportPlanInput,
  type LocalAnimal,
  type LocalCarnet,
  type LocalDose,
  type LocalEntry,
  type LocalInjection,
  type LocalPeriod,
} from '../domain/import-plan'
import type { ExportData } from '../domain/carnet-data'
import {
  CHPPIL_ID,
  IMPORT_FILE,
  IMPORT_FIXTURE,
  importFile,
  LEUCOSE_ID,
  LUNA_ID,
  LUNA_WEIGHT_ID,
  MILBEMAX_ID,
  MILO_ID,
  MILO_WEIGHT_ID,
  PANACUR_ID,
  PANACUR_MATIN_ID,
  PANACUR_PERIOD_ID,
  PANACUR_REPORT_ID,
  PANACUR_SOIR_ID,
  TYPHUS_ID,
} from '@/features/settings/__tests__/import-fixture'

const IMPORTED_AT = '2026-09-15T10:00:00.000Z'
const OLD = '2025-01-01T00:00:00.000Z'
const LUNA_PHOTO = IMPORT_FIXTURE.animals[0]!.photoFileName!
const LUNA_UPDATED_AT = IMPORT_FIXTURE.animals[0]!.updatedAt
const EMPTY: LocalCarnet = {
  carnetSettings: null,
  animals: [],
  vaccinations: [],
  vaccinationInjections: [],
  treatments: [],
  treatmentPeriods: [],
  treatmentDoses: [],
  weightEntries: [],
}

function localInjection(id: string, overrides: Partial<LocalInjection> = {}): LocalInjection {
  return { id, vaccinationId: CHPPIL_ID, updatedAt: OLD, deletedAt: null, ...overrides }
}

function localPeriod(id: string, overrides: Partial<LocalPeriod> = {}): LocalPeriod {
  return {
    id,
    treatmentId: PANACUR_ID,
    animalId: MILO_ID,
    updatedAt: OLD,
    deletedAt: null,
    ...overrides,
  }
}

function localDose(id: string, overrides: Partial<LocalDose> = {}): LocalDose {
  return {
    id,
    periodId: PANACUR_PERIOD_ID,
    treatmentId: PANACUR_ID,
    updatedAt: OLD,
    deletedAt: null,
    ...overrides,
  }
}

function localAnimal(id: string, overrides: Partial<LocalAnimal> = {}): LocalAnimal {
  return { id, updatedAt: OLD, deletedAt: null, photoPath: null, ...overrides }
}

function localEntry(id: string, animalId: string, overrides: Partial<LocalEntry> = {}): LocalEntry {
  return { id, animalId, updatedAt: OLD, deletedAt: null, ...overrides }
}

function planResult(overrides: Partial<ImportPlanInput> = {}) {
  return buildImportPlan({
    file: IMPORT_FILE,
    mode: 'merge',
    local: EMPTY,
    photosOnDevice: new Set(),
    importedAt: IMPORTED_AT,
    ...overrides,
  })
}

function buildPlan(overrides: Partial<ImportPlanInput> = {}): ImportPlan {
  const result = planResult(overrides)
  if (!result.ok) throw new Error(`Plan refusé : ${result.refused.entity}`)
  return result.plan
}

function ids<T extends { id: string }>(writes: { row: T }[]): string[] {
  return writes.map(({ row }) => row.id)
}

describe('buildImportPlan', () => {
  it('écrit tout le fichier dans une base vide, sans effacer quoi que ce soit', () => {
    const plan = buildPlan()

    expect(plan.replaceLocalData).toBe(false)
    expect(plan.carnetSettings).toEqual(IMPORT_FIXTURE.carnetSettings)
    expect(ids(plan.animals)).toEqual([LUNA_ID, MILO_ID])
    expect(ids(plan.vaccinations)).toEqual([CHPPIL_ID, TYPHUS_ID, LEUCOSE_ID])
    expect(ids(plan.vaccinationInjections)).toEqual([CHPPIL_ID, TYPHUS_ID])
    expect(ids(plan.treatments)).toEqual([MILBEMAX_ID, PANACUR_ID])
    expect(ids(plan.treatmentPeriods)).toEqual([MILBEMAX_ID, PANACUR_PERIOD_ID])
    expect(ids(plan.treatmentDoses)).toEqual([
      MILBEMAX_ID,
      PANACUR_REPORT_ID,
      PANACUR_SOIR_ID,
      PANACUR_MATIN_ID,
    ])
    expect(ids(plan.weightEntries)).toEqual([LUNA_WEIGHT_ID, MILO_WEIGHT_ID])
    expect(plan.animals.every(({ exists }) => !exists)).toBe(true)
  })

  it('reprend chaque ligne telle quelle : période, prise oubliée et report compris', () => {
    const plan = buildPlan()

    expect(plan.treatmentPeriods.map(({ row }) => row)).toEqual(IMPORT_FIXTURE.treatmentPeriods)
    expect(plan.treatmentDoses.map(({ row }) => row)).toEqual(IMPORT_FIXTURE.treatmentDoses)
    expect(plan.vaccinations.map(({ row }) => row)).toEqual(IMPORT_FIXTURE.vaccinations)
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

  describe('réglages du carnet', () => {
    const SETTINGS_UPDATED_AT = IMPORT_FIXTURE.carnetSettings!.updatedAt

    it('écrit ceux du fichier, plus récents que ceux de l’appareil, datés de l’import', () => {
      const local = { ...EMPTY, carnetSettings: { updatedAt: OLD, deletedAt: null } }

      expect(buildPlan({ local }).carnetSettings).toEqual({
        ...IMPORT_FIXTURE.carnetSettings,
        updatedAt: IMPORTED_AT,
      })
    })

    it('garde ceux de l’appareil, plus récents ou du même instant', () => {
      for (const updatedAt of [IMPORTED_AT, SETTINGS_UPDATED_AT]) {
        const local = { ...EMPTY, carnetSettings: { updatedAt, deletedAt: null } }

        expect(buildPlan({ local }).carnetSettings).toBeNull()
      }
    })

    it('ne ramène pas des réglages remis par défaut après l’export', () => {
      const local = {
        ...EMPTY,
        carnetSettings: { updatedAt: IMPORTED_AT, deletedAt: IMPORTED_AT },
      }

      expect(buildPlan({ local }).carnetSettings).toBeNull()
    })

    it('en remplacement, écrit ceux du fichier même plus anciens', () => {
      const local = { ...EMPTY, carnetSettings: { updatedAt: IMPORTED_AT, deletedAt: null } }

      expect(buildPlan({ local, mode: 'replace' }).carnetSettings).toMatchObject({
        vaccineReminderTime: '18:30',
      })
    })

    it('n’écrit rien quand le fichier n’en porte pas', () => {
      const file = importFile({ ...IMPORT_FIXTURE, carnetSettings: null })

      expect(buildPlan({ file }).carnetSettings).toBeNull()
      expect(buildPlan({ file, mode: 'replace' }).carnetSettings).toBeNull()
    })
  })

  describe('rattachement figé', () => {
    it('refuse le fichier si une entrée déjà en base change d’animal', () => {
      const local = { ...EMPTY, vaccinations: [localEntry(CHPPIL_ID, LUNA_ID)] }

      expect(planResult({ local })).toEqual({
        ok: false,
        refused: { reason: 'reattached', entity: 'vaccination', id: CHPPIL_ID },
      })
    })

    it('refuse aussi une entrée dont l’animal reste supprimé localement', () => {
      const local = {
        ...EMPTY,
        animals: [localAnimal(LUNA_ID, { deletedAt: IMPORTED_AT, updatedAt: IMPORTED_AT })],
        weightEntries: [localEntry(MILO_WEIGHT_ID, LUNA_ID)],
      }

      expect(planResult({ local })).toMatchObject({
        ok: false,
        refused: { reason: 'reattached', entity: 'weightEntry' },
      })
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
      expect(ids(plan.treatments)).toEqual([PANACUR_ID])
    })

    it('n’importe pas le carnet d’un animal qui reste supprimé', () => {
      const local = {
        ...EMPTY,
        animals: [localAnimal(LUNA_ID, { deletedAt: IMPORTED_AT, updatedAt: IMPORTED_AT })],
      }

      const plan = buildPlan({ local })

      expect(ids(plan.vaccinations)).toEqual([CHPPIL_ID])
      expect(ids(plan.treatments)).toEqual([PANACUR_ID])
      expect(ids(plan.treatmentPeriods)).toEqual([PANACUR_PERIOD_ID])
      expect(plan.treatmentDoses.every(({ row }) => row.treatmentId === PANACUR_ID)).toBe(true)
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

  describe('injections', () => {
    const ancienne = {
      ...IMPORT_FIXTURE.vaccinationInjections[0]!,
      id: 'ancienne',
      injectedOn: '2024-09-01',
      nextDueDate: '2025-09-01',
    }
    const withHistory: ExportData = {
      ...IMPORT_FIXTURE,
      vaccinationInjections: [...IMPORT_FIXTURE.vaccinationInjections, ancienne],
    }

    function chppilInjections(plan: ImportPlan) {
      return plan.vaccinationInjections.filter(({ row }) => row.vaccinationId === CHPPIL_ID)
    }

    it('écrit chaque injection du fichier avec son identifiant', () => {
      const plan = buildPlan({ file: importFile(withHistory) })

      expect(chppilInjections(plan)).toEqual([
        { row: IMPORT_FIXTURE.vaccinationInjections[0], exists: false },
        { row: ancienne, exists: false },
      ])
    })

    it('retrouve une injection par son identifiant : plus récente dans le fichier, sa date suit', () => {
      const moved = { ...ancienne, injectedOn: '2024-10-01', updatedAt: IMPORTED_AT }
      const local = {
        ...EMPTY,
        vaccinations: [localEntry(CHPPIL_ID, MILO_ID)],
        vaccinationInjections: [localInjection('ancienne')],
      }

      const plan = buildPlan({
        file: importFile({ ...IMPORT_FIXTURE, vaccinationInjections: [moved] }),
        local,
      })

      expect(chppilInjections(plan)).toEqual([
        { row: { ...moved, updatedAt: IMPORTED_AT }, exists: true },
      ])
    })

    it('garde une injection plus récente sur l’appareil', () => {
      const local = {
        ...EMPTY,
        vaccinations: [localEntry(CHPPIL_ID, MILO_ID)],
        vaccinationInjections: [localInjection('ancienne', { updatedAt: IMPORTED_AT })],
      }

      expect(chppilInjections(buildPlan({ file: importFile(withHistory), local }))).toEqual([
        { row: IMPORT_FIXTURE.vaccinationInjections[0], exists: false },
      ])
    })

    it('écrit les injections d’un vaccin resté plus récent sur l’appareil', () => {
      const local = {
        ...EMPTY,
        animals: [localAnimal(MILO_ID, { updatedAt: IMPORTED_AT })],
        vaccinations: [localEntry(CHPPIL_ID, MILO_ID, { updatedAt: IMPORTED_AT })],
      }

      const plan = buildPlan({ file: importFile(withHistory), local })

      expect(ids(plan.vaccinations)).toEqual([TYPHUS_ID, LEUCOSE_ID])
      expect(ids(chppilInjections(plan))).toEqual([CHPPIL_ID, 'ancienne'])
    })

    it('n’écrit aucune injection sous un vaccin qui reste supprimé', () => {
      const local = {
        ...EMPTY,
        vaccinations: [
          localEntry(CHPPIL_ID, MILO_ID, { deletedAt: IMPORTED_AT, updatedAt: IMPORTED_AT }),
        ],
      }

      const plan = buildPlan({ file: importFile(withHistory), local })

      expect(chppilInjections(plan)).toEqual([])
    })

    it('en remplacement, n’écrit aucune injection sous un vaccin qui n’est que sur l’appareil', () => {
      const underLocal = {
        ...IMPORT_FIXTURE.vaccinationInjections[0]!,
        id: 'sous-vaccin-local',
        vaccinationId: 'vaccin-local',
      }
      const data = {
        ...IMPORT_FIXTURE,
        vaccinationInjections: [...IMPORT_FIXTURE.vaccinationInjections, underLocal],
      }
      const local = { ...EMPTY, vaccinations: [localEntry('vaccin-local', MILO_ID)] }

      const merged = buildPlan({ file: importFile(data), local })
      const replaced = buildPlan({ file: importFile(data), local, mode: 'replace' })

      expect(ids(merged.vaccinationInjections)).toContain('sous-vaccin-local')
      expect(ids(replaced.vaccinationInjections)).toEqual([CHPPIL_ID, TYPHUS_ID])
    })

    describe('vaccin supprimé seul, rendu visible par le fichier', () => {
      const DELETED = '2026-09-10T00:00:00.000Z'
      const CANCELLED = '2026-09-05T00:00:00.000Z'
      const withParent = { deletedAt: DELETED, updatedAt: DELETED }
      const newerParent: ExportData = {
        ...withHistory,
        vaccinations: withHistory.vaccinations.map((vaccination) =>
          vaccination.id === CHPPIL_ID ? { ...vaccination, updatedAt: IMPORTED_AT } : vaccination,
        ),
      }

      function deletedAlone(vaccinationInjections: LocalInjection[]): LocalCarnet {
        return {
          ...EMPTY,
          animals: [localAnimal(MILO_ID)],
          vaccinations: [localEntry(CHPPIL_ID, MILO_ID, withParent)],
          vaccinationInjections,
        }
      }

      it('revient avec ses injections : celles du fichier à ses valeurs, les autres telles quelles', () => {
        const local = deletedAlone([
          localInjection(CHPPIL_ID, withParent),
          localInjection('hors-fichier', withParent),
          localInjection('annulee', { deletedAt: CANCELLED, updatedAt: CANCELLED }),
        ])

        const plan = buildPlan({ file: importFile(newerParent), local })

        expect(chppilInjections(plan)).toEqual([
          {
            row: { ...IMPORT_FIXTURE.vaccinationInjections[0], updatedAt: IMPORTED_AT },
            exists: true,
          },
          { row: ancienne, exists: false },
        ])
        expect(plan.revivedInjections).toEqual(['hors-fichier'])
      })

      it('en remplacement, n’écrit que les injections du fichier', () => {
        const local = deletedAlone([localInjection('hors-fichier', withParent)])

        const plan = buildPlan({ file: importFile(newerParent), local, mode: 'replace' })

        expect(ids(chppilInjections(plan))).toEqual([CHPPIL_ID, 'ancienne'])
        expect(plan.revivedInjections).toEqual([])
      })

      it('reconnaît une ligne supprimée avec son parent à son `deletedAt` exact', () => {
        const parentCascades = new Map([[CHPPIL_ID, DELETED]])
        const event = { id: 'e', updatedAt: DELETED, parentId: CHPPIL_ID }

        expect(deletedWithItsParent({ ...event, deletedAt: DELETED }, parentCascades)).toBe(true)
        expect(deletedWithItsParent({ ...event, deletedAt: CANCELLED }, parentCascades)).toBe(false)
        expect(deletedWithItsParent({ ...event, deletedAt: null }, parentCascades)).toBe(false)
      })
    })
  })

  describe('périodes et prises', () => {
    const DELETED = '2026-09-12T00:00:00.000Z'
    const CANCELLED = '2026-09-11T00:00:00.000Z'
    const withTreatment = { deletedAt: DELETED, updatedAt: DELETED }

    function panacurDoses(plan: ImportPlan) {
      return plan.treatmentDoses.filter(({ row }) => row.treatmentId === PANACUR_ID)
    }

    it('garde une période et une prise plus récentes sur l’appareil, écrit les autres', () => {
      const local = {
        ...EMPTY,
        treatments: [localEntry(PANACUR_ID, MILO_ID)],
        treatmentPeriods: [localPeriod(PANACUR_PERIOD_ID, { updatedAt: IMPORTED_AT })],
        treatmentDoses: [
          localDose(PANACUR_MATIN_ID, { updatedAt: IMPORTED_AT }),
          localDose(PANACUR_SOIR_ID),
        ],
      }

      const plan = buildPlan({ local })

      expect(ids(plan.treatmentPeriods)).toEqual([MILBEMAX_ID])
      expect(panacurDoses(plan)).toEqual([
        { row: IMPORT_FIXTURE.treatmentDoses[1], exists: false },
        { row: { ...IMPORT_FIXTURE.treatmentDoses[2], updatedAt: IMPORTED_AT }, exists: true },
      ])
    })

    it('n’écrit ni période ni prise sous un traitement qui reste supprimé', () => {
      const local = {
        ...EMPTY,
        treatments: [
          localEntry(PANACUR_ID, MILO_ID, { deletedAt: IMPORTED_AT, updatedAt: IMPORTED_AT }),
        ],
      }

      const plan = buildPlan({ local })

      expect(ids(plan.treatmentPeriods)).toEqual([MILBEMAX_ID])
      expect(ids(plan.treatmentDoses)).toEqual([MILBEMAX_ID])
    })

    it('n’écrit aucune prise dans une période qui reste supprimée', () => {
      const local = {
        ...EMPTY,
        treatments: [localEntry(PANACUR_ID, MILO_ID)],
        treatmentPeriods: [
          localPeriod(PANACUR_PERIOD_ID, { deletedAt: IMPORTED_AT, updatedAt: IMPORTED_AT }),
        ],
      }

      const plan = buildPlan({ local })

      expect(ids(plan.treatmentPeriods)).toEqual([MILBEMAX_ID])
      expect(panacurDoses(plan)).toEqual([])
    })

    it('ramène un traitement supprimé seul avec ses périodes et ses prises, pas celles annulées avant', () => {
      const newerTreatment: ExportData = {
        ...IMPORT_FIXTURE,
        treatments: IMPORT_FIXTURE.treatments.map((treatment) =>
          treatment.id === PANACUR_ID ? { ...treatment, updatedAt: IMPORTED_AT } : treatment,
        ),
      }
      const local: LocalCarnet = {
        ...EMPTY,
        animals: [localAnimal(MILO_ID)],
        treatments: [localEntry(PANACUR_ID, MILO_ID, withTreatment)],
        treatmentPeriods: [
          localPeriod(PANACUR_PERIOD_ID, withTreatment),
          localPeriod('periode-hors-fichier', withTreatment),
          localPeriod('periode-annulee', { deletedAt: CANCELLED, updatedAt: CANCELLED }),
        ],
        treatmentDoses: [
          localDose(PANACUR_MATIN_ID, withTreatment),
          localDose('prise-hors-fichier', { ...withTreatment, periodId: 'periode-hors-fichier' }),
          localDose('prise-annulee', { deletedAt: CANCELLED, updatedAt: CANCELLED }),
          localDose('prise-de-periode-annulee', { ...withTreatment, periodId: 'periode-annulee' }),
        ],
      }

      const plan = buildPlan({ file: importFile(newerTreatment), local })

      expect(plan.treatmentPeriods.filter(({ row }) => row.treatmentId === PANACUR_ID)).toEqual([
        { row: { ...IMPORT_FIXTURE.treatmentPeriods[1], updatedAt: IMPORTED_AT }, exists: true },
      ])
      expect(plan.revivedPeriods).toEqual(['periode-hors-fichier'])
      expect(panacurDoses(plan).map(({ row, exists }) => [row.id, exists])).toEqual([
        [PANACUR_REPORT_ID, false],
        [PANACUR_SOIR_ID, false],
        [PANACUR_MATIN_ID, true],
      ])
      expect(plan.revivedDoses).toEqual(['prise-hors-fichier'])
    })

    it('en remplacement, ne ramène rien de l’appareil', () => {
      const local: LocalCarnet = {
        ...EMPTY,
        treatments: [localEntry(PANACUR_ID, MILO_ID, withTreatment)],
        treatmentPeriods: [localPeriod('periode-hors-fichier', withTreatment)],
        treatmentDoses: [
          localDose('prise-hors-fichier', { ...withTreatment, periodId: 'periode-hors-fichier' }),
        ],
      }

      const plan = buildPlan({ local, mode: 'replace' })

      expect(plan.revivedPeriods).toEqual([])
      expect(plan.revivedDoses).toEqual([])
      expect(ids(plan.treatmentPeriods)).toEqual([MILBEMAX_ID, PANACUR_PERIOD_ID])
    })

    it('reprend l’échéance d’une prise telle quelle, sans la recalculer', () => {
      const data = {
        ...IMPORT_FIXTURE,
        treatmentDoses: IMPORT_FIXTURE.treatmentDoses.map((dose) => ({
          ...dose,
          nextDueDate: '2027-01-31',
        })),
      }

      expect(buildPlan({ file: importFile(data) }).treatmentDoses[0]!.row).toMatchObject({
        givenOn: '2026-06-15',
        nextDueDate: '2027-01-31',
      })
    })
  })

  describe('refus propres aux lignes rattachées à un parent', () => {
    const [milbemaxDose, , , matin] = IMPORT_FIXTURE.treatmentDoses
    const panacurPeriod = IMPORT_FIXTURE.treatmentPeriods[1]!

    it('refuse une prise dont le traitement n’est ni dans le fichier ni sur l’appareil', () => {
      const orphan = { ...milbemaxDose!, id: 'orpheline', treatmentId: 'traitement-inconnu' }
      const data = { ...IMPORT_FIXTURE, treatmentDoses: [orphan] }

      expect(planResult({ file: importFile(data) })).toEqual({
        ok: false,
        refused: { reason: 'orphanEvent', entity: 'treatmentDose', id: 'orpheline' },
      })
    })

    it('refuse une période dont le traitement n’est ni dans le fichier ni sur l’appareil', () => {
      const orphan = { ...panacurPeriod, id: 'orpheline', treatmentId: 'traitement-inconnu' }
      const data = { ...IMPORT_FIXTURE, treatmentPeriods: [orphan], treatmentDoses: [] }

      expect(planResult({ file: importFile(data) })).toEqual({
        ok: false,
        refused: { reason: 'orphanEvent', entity: 'treatmentPeriod', id: 'orpheline' },
      })
    })

    it('refuse une prise dont la période n’est ni dans le fichier ni sur l’appareil', () => {
      const data = {
        ...IMPORT_FIXTURE,
        treatmentDoses: [{ ...matin!, periodId: 'periode-inconnue' }],
      }

      expect(planResult({ file: importFile(data) })).toEqual({
        ok: false,
        refused: { reason: 'orphanEvent', entity: 'treatmentDose', id: PANACUR_MATIN_ID },
      })
    })

    it('accepte une ligne dont le parent n’est que sur l’appareil', () => {
      const data = { ...IMPORT_FIXTURE, treatments: [], treatmentPeriods: [] }
      const local = {
        ...EMPTY,
        treatments: [localEntry(MILBEMAX_ID, LUNA_ID), localEntry(PANACUR_ID, MILO_ID)],
        treatmentPeriods: [
          localPeriod(MILBEMAX_ID, { treatmentId: MILBEMAX_ID, animalId: LUNA_ID }),
          localPeriod(PANACUR_PERIOD_ID),
        ],
      }

      const plan = buildPlan({ file: importFile(data), local })

      expect(plan.treatmentDoses).toHaveLength(4)
    })

    it('refuse une prise qui vise la période d’un autre traitement, dans le fichier ou sur l’appareil', () => {
      const misplaced = { ...matin!, periodId: MILBEMAX_ID }
      const inFile = { ...IMPORT_FIXTURE, treatmentDoses: [misplaced] }
      const onDevice = {
        ...inFile,
        treatmentPeriods: [panacurPeriod],
      }
      const local = {
        ...EMPTY,
        treatments: [localEntry(MILBEMAX_ID, LUNA_ID)],
        treatmentPeriods: [
          localPeriod(MILBEMAX_ID, { treatmentId: MILBEMAX_ID, animalId: LUNA_ID }),
        ],
      }
      const refused = {
        ok: false,
        refused: { reason: 'reattached', entity: 'treatmentDose', id: PANACUR_MATIN_ID },
      }

      expect(planResult({ file: importFile(inFile) })).toEqual(refused)
      expect(planResult({ file: importFile(onDevice), local })).toEqual(refused)
    })

    it('refuse une ligne qui n’a pas l’animal de son parent, dans le fichier ou sur l’appareil', () => {
      const misplaced = { ...IMPORT_FIXTURE.vaccinationInjections[0]!, animalId: LUNA_ID }
      const inFile = { ...IMPORT_FIXTURE, vaccinationInjections: [misplaced] }
      const onDevice = { ...inFile, vaccinations: [] }
      const local = { ...EMPTY, vaccinations: [localEntry(CHPPIL_ID, MILO_ID)] }
      const refused = {
        ok: false,
        refused: { reason: 'reattached', entity: 'vaccinationInjection', id: CHPPIL_ID },
      }

      expect(planResult({ file: importFile(inFile) })).toEqual(refused)
      expect(planResult({ file: importFile(onDevice), local })).toEqual(refused)
    })

    const misplacedRows: [string, string, Partial<ExportData>][] = [
      [
        'une période',
        'treatmentPeriod',
        { treatmentPeriods: [{ ...panacurPeriod, animalId: LUNA_ID }] },
      ],
      ['une prise', 'treatmentDose', { treatmentDoses: [{ ...matin!, animalId: LUNA_ID }] }],
    ]

    it.each(misplacedRows)(
      'refuse %s qui n’a pas l’animal de son traitement',
      (_, entity, rows) => {
        expect(planResult({ file: importFile({ ...IMPORT_FIXTURE, ...rows }) })).toMatchObject({
          ok: false,
          refused: { reason: 'reattached', entity },
        })
      },
    )

    it('refuse une injection déjà sur l’appareil sous un autre vaccin', () => {
      const local = {
        ...EMPTY,
        vaccinations: [localEntry(TYPHUS_ID, LUNA_ID)],
        vaccinationInjections: [localInjection(CHPPIL_ID, { vaccinationId: 'autre' })],
      }

      expect(planResult({ local })).toMatchObject({
        ok: false,
        refused: { reason: 'reattached', entity: 'vaccinationInjection', id: CHPPIL_ID },
      })
    })

    it('refuse une période déjà sur l’appareil sous un autre traitement', () => {
      const local = {
        ...EMPTY,
        treatmentPeriods: [localPeriod(PANACUR_PERIOD_ID, { treatmentId: 'autre' })],
      }

      expect(planResult({ local })).toMatchObject({
        ok: false,
        refused: { reason: 'reattached', entity: 'treatmentPeriod', id: PANACUR_PERIOD_ID },
      })
    })

    it('refuse une prise déjà sur l’appareil dans une autre période du même traitement', () => {
      const local = {
        ...EMPTY,
        treatmentPeriods: [localPeriod('autre-periode')],
        treatmentDoses: [localDose(PANACUR_MATIN_ID, { periodId: 'autre-periode' })],
      }

      expect(planResult({ local })).toMatchObject({
        ok: false,
        refused: { reason: 'reattached', entity: 'treatmentDose', id: PANACUR_MATIN_ID },
      })
    })
  })
})
