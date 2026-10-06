import { strToU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'

import {
  buildExportFile,
  EXPORT_SCHEMA_VERSION,
  exportFileName,
  exportReminders,
  toCsvTables,
  toJsonExport,
} from '../logic/export-format'
import { EXPORT_FIXTURE, FIXTURE_DEVICE, LUNA_ID, MILO_ID, periodOf } from './export-fixture'

const META = { exportedAt: new Date('2026-09-15T10:30:00'), appVersion: '0.1.24' }
const TODAY = '2026-09-11'
/** Jour de `META.exportedAt` : celui que lisent le JSON et l'archive. */
const EXPORT_DAY = '2026-09-15'
const BOM = '\uFEFF'

function lines(csv: string): string[] {
  return csv.slice(BOM.length).split('\r\n')
}

describe('exportFileName', () => {
  it('date le fichier à la minute, heure locale sur 24 h, en .json ou en .zip', () => {
    expect(exportFileName('json', META.exportedAt)).toBe('memopatte-export-20260915-1030.json')
    expect(exportFileName('csv', new Date('2026-09-15T21:07:00'))).toBe(
      'memopatte-export-20260915-2107.zip',
    )
  })
})

describe('exportReminders', () => {
  it('liste l’échéance de la dernière injection ou ligne de chaque parent, la plus proche d’abord', () => {
    expect(exportReminders(EXPORT_FIXTURE, TODAY)).toEqual([
      {
        kind: 'vaccination',
        sourceId: 'v-chppil',
        animalId: MILO_ID,
        name: 'CHPPiL',
        dueDate: '2026-09-01',
      },
      {
        kind: 'treatment',
        sourceId: 't-panacur',
        animalId: MILO_ID,
        name: 'Panacur',
        dueDate: '2026-09-11',
      },
      {
        kind: 'treatment',
        sourceId: 't-milbemax',
        animalId: LUNA_ID,
        name: 'Milbémax',
        dueDate: '2026-09-15',
      },
      {
        kind: 'vaccination',
        sourceId: 'v-leucose',
        animalId: LUNA_ID,
        name: 'Leucose',
        dueDate: '2026-11-02',
      },
    ])
  })

  it('lit le rappel prévu d’un vaccin seulement tant qu’il n’a aucune injection', () => {
    const data = {
      ...EXPORT_FIXTURE,
      vaccinations: EXPORT_FIXTURE.vaccinations.map((vaccination) => ({
        ...vaccination,
        plannedDueDate: '2030-01-01',
      })),
    }

    expect(exportReminders(data, TODAY).filter(({ kind }) => kind === 'vaccination')).toMatchObject(
      [
        { sourceId: 'v-chppil', dueDate: '2026-09-01' },
        { sourceId: 'v-leucose', dueDate: '2030-01-01' },
      ],
    )
  })

  it('donne la première échéance d’une période qui n’a encore aucune ligne', () => {
    const data = {
      ...EXPORT_FIXTURE,
      treatmentDoses: EXPORT_FIXTURE.treatmentDoses.filter(
        ({ treatmentId }) => treatmentId !== 't-panacur',
      ),
    }

    expect(
      exportReminders(data, '2026-09-05').find(({ sourceId }) => sourceId === 't-panacur')?.dueDate,
    ).toBe('2026-09-10')
  })

  it('lit la période en cours : la reprise d’un traitement arrêté, pas la période d’avant', () => {
    const reprise = periodOf({
      id: 'p-milbemax-reprise',
      treatmentId: 't-milbemax',
      animalId: LUNA_ID,
      startsOn: '2026-10-01',
      createdAt: '2026-09-20T08:00:00.000Z',
      updatedAt: '2026-09-20T08:00:00.000Z',
    })
    const data = {
      ...EXPORT_FIXTURE,
      treatmentPeriods: [
        ...EXPORT_FIXTURE.treatmentPeriods.map((period) =>
          period.id === 'p-milbemax' ? { ...period, stoppedOn: '2026-07-01' } : period,
        ),
        reprise,
      ],
    }

    expect(
      exportReminders(data, TODAY).find(({ sourceId }) => sourceId === 't-milbemax')?.dueDate,
    ).toBe('2026-10-01')
  })

  it('n’annonce rien après la date de fin d’un traitement', () => {
    const data = {
      ...EXPORT_FIXTURE,
      treatmentPeriods: EXPORT_FIXTURE.treatmentPeriods.map((period) =>
        period.id === 'p-panacur' ? { ...period, endsOn: '2026-09-10' } : period,
      ),
    }

    expect(exportReminders(data, TODAY).map(({ sourceId }) => sourceId)).not.toContain('t-panacur')
  })
})

describe('exportReminders, traitement arrêté', () => {
  const ARRETE = {
    ...EXPORT_FIXTURE,
    treatmentPeriods: EXPORT_FIXTURE.treatmentPeriods.map((period) => ({
      ...period,
      stoppedOn: '2026-09-10',
    })),
  }

  it('écarte un traitement arrêté des échéances du JSON et de rappels.csv', () => {
    expect(exportReminders(ARRETE, TODAY).map((reminder) => reminder.sourceId)).toEqual([
      'v-chppil',
      'v-leucose',
    ])
    expect(lines(toCsvTables(ARRETE, 'kg', TODAY)['rappels.csv'])).toEqual([
      'kind;sourceId;animalId;animalName;name;dueDate',
      `vaccination;v-chppil;${MILO_ID};Milo;CHPPiL;2026-09-01`,
      `vaccination;v-leucose;${LUNA_ID};Luna;Leucose;2026-11-02`,
      '',
    ])
  })

  it('garde le traitement arrêté dans le JSON, sa date d’arrêt sur sa période', () => {
    const parsed = JSON.parse(toJsonExport(ARRETE, META))

    expect(parsed.treatments.map(({ id }: { id: string }) => id)).toEqual([
      't-milbemax',
      't-panacur',
    ])
    expect(parsed.treatmentPeriods).toEqual([
      expect.objectContaining({ id: 'p-milbemax', stoppedOn: '2026-09-10' }),
      expect.objectContaining({ id: 'p-panacur', stoppedOn: '2026-09-10' }),
    ])
  })
})

describe('toJsonExport', () => {
  const parsed = JSON.parse(toJsonExport(EXPORT_FIXTURE, META))

  it('versionne le document pour l’import', () => {
    expect(parsed.schemaVersion).toBe(EXPORT_SCHEMA_VERSION)
    expect(parsed.schemaVersion).toBe(4)
    expect(parsed.exportedAt).toBe(META.exportedAt.toISOString())
    expect(parsed.appVersion).toBe('0.1.24')
  })

  it('reprend toutes les tables, réglages et historique compris, texte libre intact', () => {
    expect(Object.keys(parsed)).toEqual([
      'schemaVersion',
      'exportedAt',
      'appVersion',
      'carnetSettings',
      'animals',
      'vaccinations',
      'vaccinationInjections',
      'treatments',
      'treatmentPeriods',
      'treatmentDoses',
      'weightEntries',
      'devices',
      'reminders',
    ])
    const { reminders, schemaVersion: _, exportedAt: __, appVersion: ___, ...tables } = parsed
    expect(tables).toEqual(EXPORT_FIXTURE)
    expect(reminders).toEqual(exportReminders(EXPORT_FIXTURE, EXPORT_DAY))
  })

  it('écrit `null` pour des réglages du carnet jamais touchés', () => {
    const untouched = JSON.parse(toJsonExport({ ...EXPORT_FIXTURE, carnetSettings: null }, META))

    expect(untouched.carnetSettings).toBeNull()
  })

  it('porte les nouvelles colonnes de l’animal', () => {
    expect(parsed.animals[0]).toMatchObject({ birthDateApproximate: true, unfollowedOn: null })
    expect(parsed.animals[1]).toMatchObject({
      birthDateApproximate: false,
      unfollowedOn: '2026-09-14',
      departureReason: 'rehomed',
      departureDate: '2026-09-12',
    })
  })

  it('décrit une période avec ses heures, sa posologie, sa fin et le moment de son rappel', () => {
    expect(parsed.treatmentPeriods[1]).toEqual({
      id: 'p-panacur',
      treatmentId: 't-panacur',
      animalId: MILO_ID,
      startsOn: '2026-09-10',
      firstDueOn: '2026-09-10',
      referenceOn: '2026-09-10',
      endsOn: '2026-09-20',
      stoppedOn: null,
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      doseQuantity: 0.5,
      doseUnit: 'tablet',
      reminderOffsetMinutes: 30,
      reminderTime: null,
      createdAt: '2026-09-10T07:00:00.000Z',
      updatedAt: '2026-09-10T07:00:00.000Z',
      createdByDevice: FIXTURE_DEVICE,
      updatedByDevice: FIXTURE_DEVICE,
    })
  })

  it('décrit une prise par son échéance, sa période et son état, sans fréquence recopiée', () => {
    expect(parsed.treatmentDoses[2]).toEqual({
      id: 'd-panacur-soir',
      periodId: 'p-panacur',
      treatmentId: 't-panacur',
      animalId: MILO_ID,
      dueOn: '2026-09-10',
      dueTime: '20:00',
      givenOn: null,
      status: 'missed',
      nextDueDate: '2026-09-11',
      createdAt: '2026-09-10T07:00:00.000Z',
      updatedAt: '2026-09-10T07:00:00.000Z',
      createdByDevice: FIXTURE_DEVICE,
      updatedByDevice: FIXTURE_DEVICE,
    })
  })

  it('porte les appareils qui ont écrit dans le carnet, nommés par leur modèle et leur installation', () => {
    expect(parsed.devices).toEqual([
      {
        id: FIXTURE_DEVICE,
        model: 'Pixel 8',
        installedAt: '2026-01-10T07:55:00.000Z',
        createdAt: '2026-01-10T07:55:00.000Z',
        updatedAt: '2026-01-10T07:55:00.000Z',
      },
    ])
  })

  it('ne répète pas sur un parent la date ni l’échéance portées par ses événements', () => {
    expect(Object.keys(parsed.vaccinations[0])).toEqual([
      'id',
      'animalId',
      'name',
      'plannedDueDate',
      'createdAt',
      'updatedAt',
      'createdByDevice',
      'updatedByDevice',
    ])
    expect(Object.keys(parsed.treatments[0])).toEqual([
      'id',
      'animalId',
      'name',
      'type',
      'createdAt',
      'updatedAt',
      'createdByDevice',
      'updatedByDevice',
    ])
  })

  it('référence la photo par son nom de fichier, sans contenu encodé', () => {
    expect(parsed.animals[0].photoFileName).toBe('0f6c1c9e-5d6b-4b43-9a57-2f1d8b0c7a11.jpg')
    expect(toJsonExport(EXPORT_FIXTURE, META)).not.toMatch(/base64|data:image/)
  })
})

describe('toCsvTables', () => {
  const tables = toCsvTables(EXPORT_FIXTURE, 'kg', TODAY)

  it('produit un fichier par table', () => {
    expect(Object.keys(tables)).toEqual([
      'animaux.csv',
      'vaccins.csv',
      'injections.csv',
      'traitements.csv',
      'periodes.csv',
      'prises.csv',
      'poids.csv',
      'rappels.csv',
    ])
  })

  it('commence chaque fichier par le BOM UTF-8 et termine chaque ligne par CRLF', () => {
    for (const csv of Object.values(tables)) {
      expect(csv.startsWith(BOM)).toBe(true)
      expect(csv.endsWith('\r\n')).toBe(true)
    }
  })

  it('sépare par « ; », entoure de guillemets un champ qui contient « ; » ou « " »', () => {
    expect(lines(tables['animaux.csv'])).toEqual([
      'id;name;species;breed;birthDate;birthDateApproximate;unfollowedOn;departureReason;departureDate;createdAt;updatedAt',
      `${LUNA_ID};Luna;cat;"Européen ; tigrée ""Mimi""";2019-03-02;true;;;;2026-01-10T08:00:00.000Z;2026-02-01T08:00:00.000Z`,
      `${MILO_ID};Milo;dog;;;false;2026-09-14;rehomed;2026-09-12;2026-01-12T08:00:00.000Z;2026-01-12T08:00:00.000Z`,
      '',
    ])
  })

  it('exclut les photos du CSV', () => {
    expect(Object.values(tables).join('')).not.toContain('.jpg')
  })

  it('garde les dates ISO et nomme l’animal à côté de son identifiant', () => {
    expect(lines(tables['vaccins.csv'])).toEqual([
      'id;animalId;animalName;name;plannedDueDate;lastInjectionDate;dueDate',
      `v-chppil;${MILO_ID};Milo;CHPPiL;;2025-09-01;2026-09-01`,
      `v-typhus;${LUNA_ID};Luna;"Typhus; coryza";;2024-05-20;`,
      `v-leucose;${LUNA_ID};Luna;Leucose;2026-11-02;;2026-11-02`,
      '',
    ])
    expect(lines(tables['traitements.csv'])).toEqual([
      'id;animalId;animalName;name;type;lastDoseDate;nextDueDate',
      `t-milbemax;${LUNA_ID};Luna;Milbémax;deworming;2026-06-15;2026-09-15`,
      `t-panacur;${MILO_ID};Milo;Panacur;deworming;2026-09-10;2026-09-11`,
      '',
    ])
  })

  it('exporte un médicament sans prise : sa première échéance, aucune dernière prise', () => {
    const stamps = {
      createdAt: '2026-09-14T08:00:00.000Z',
      updatedAt: '2026-09-14T08:00:00.000Z',
      createdByDevice: 'appareil-test',
      updatedByDevice: 'appareil-test',
    }
    const data = {
      ...EXPORT_FIXTURE,
      treatments: [
        ...EXPORT_FIXTURE.treatments,
        {
          id: 't-metacam',
          animalId: LUNA_ID,
          name: 'Métacam',
          type: 'medication' as const,
          ...stamps,
        },
      ],
      treatmentPeriods: [
        ...EXPORT_FIXTURE.treatmentPeriods,
        periodOf({
          id: 'p-metacam',
          treatmentId: 't-metacam',
          animalId: LUNA_ID,
          startsOn: '2026-09-14',
          firstDueOn: '2026-10-05',
          ...stamps,
        }),
      ],
    }

    expect(lines(toCsvTables(data, 'kg', TODAY)['traitements.csv'])).toContain(
      `t-metacam;${LUNA_ID};Luna;Métacam;medication;;2026-10-05`,
    )
    expect(exportReminders(data, TODAY)).toContainEqual({
      kind: 'treatment',
      sourceId: 't-metacam',
      animalId: LUNA_ID,
      name: 'Métacam',
      dueDate: '2026-10-05',
    })
    expect(JSON.parse(toJsonExport(data, META)).treatments.at(-1).type).toBe('medication')
  })

  it('écrit une ligne par période, avec ses réglages : fin, heures, posologie, moment du rappel', () => {
    expect(lines(tables['periodes.csv'])).toEqual([
      'id;treatmentId;treatmentName;animalId;animalName;startsOn;firstDueOn;endsOn;stoppedOn;frequencyValue;frequencyUnit;times;doseQuantity;doseUnit;reminderOffsetMinutes;reminderTime',
      `p-milbemax;t-milbemax;Milbémax;${LUNA_ID};Luna;2026-03-15;2026-03-15;;;3;month;;;;;`,
      `p-panacur;t-panacur;Panacur;${MILO_ID};Milo;2026-09-10;2026-09-10;2026-09-20;;1;day;08:00, 20:00;0,5;tablet;30;`,
      '',
    ])
  })

  it('écrit une ligne par injection et par prise, reliée à son vaccin ou traitement', () => {
    expect(lines(tables['injections.csv'])).toEqual([
      'id;vaccinationId;vaccinationName;animalId;animalName;injectedOn;nextDueDate',
      `i-chppil-2025;v-chppil;CHPPiL;${MILO_ID};Milo;2025-09-01;2026-09-01`,
      `i-chppil-2024;v-chppil;CHPPiL;${MILO_ID};Milo;2024-09-01;2025-09-01`,
      `i-typhus;v-typhus;"Typhus; coryza";${LUNA_ID};Luna;2024-05-20;`,
      '',
    ])
    expect(lines(tables['prises.csv'])).toEqual([
      'id;periodId;treatmentId;treatmentName;animalId;animalName;dueOn;dueTime;givenOn;status;nextDueDate',
      `d-milbemax-06;p-milbemax;t-milbemax;Milbémax;${LUNA_ID};Luna;2026-06-15;;2026-06-15;given;2026-09-15`,
      `d-milbemax-03;p-milbemax;t-milbemax;Milbémax;${LUNA_ID};Luna;2026-03-15;;2026-03-15;given;2026-06-15`,
      `d-panacur-soir;p-panacur;t-panacur;Panacur;${MILO_ID};Milo;2026-09-10;20:00;;missed;2026-09-11`,
      `d-panacur-matin;p-panacur;t-panacur;Panacur;${MILO_ID};Milo;2026-09-10;08:00;2026-09-10;given;2026-09-10`,
      '',
    ])
  })

  it('écrit les poids avec une virgule décimale, lisible par un tableur français', () => {
    expect(lines(tables['poids.csv'])).toEqual([
      'id;animalId;animalName;measuredOn;weightKg',
      `w-luna-1;${LUNA_ID};Luna;2025-12-24;4,25`,
      `w-milo-1;${MILO_ID};Milo;2026-08-30;12`,
      '',
    ])
  })

  it('écrit en kilos au centième une pesée saisie en livres, sans décimales parasites', () => {
    const data = {
      ...EXPORT_FIXTURE,
      weightEntries: [{ ...EXPORT_FIXTURE.weightEntries[0]!, weightKg: 54.1 * 0.45359237 }],
    }
    const tables = toCsvTables(data, 'kg', TODAY)

    expect(lines(tables['poids.csv'])[1]).toMatch(/;24,54$/)
    expect(JSON.parse(toJsonExport(data, META)).weightEntries[0].weightKg).toBe(54.1 * 0.45359237)
  })

  it('écrit les poids en livres quand c’est l’unité choisie, l’unité dans le titre de colonne', () => {
    const enLivres = toCsvTables(EXPORT_FIXTURE, 'lb', TODAY)

    expect(lines(enLivres['poids.csv'])).toEqual([
      'id;animalId;animalName;measuredOn;weightLb',
      `w-luna-1;${LUNA_ID};Luna;2025-12-24;9,37`,
      `w-milo-1;${MILO_ID};Milo;2026-08-30;26,46`,
      '',
    ])
  })

  it('liste les échéances dans rappels.csv', () => {
    expect(lines(tables['rappels.csv'])).toEqual([
      'kind;sourceId;animalId;animalName;name;dueDate',
      `vaccination;v-chppil;${MILO_ID};Milo;CHPPiL;2026-09-01`,
      `treatment;t-panacur;${MILO_ID};Milo;Panacur;2026-09-11`,
      `treatment;t-milbemax;${LUNA_ID};Luna;Milbémax;2026-09-15`,
      `vaccination;v-leucose;${LUNA_ID};Luna;Leucose;2026-11-02`,
      '',
    ])
  })

  it('neutralise une formule de tableur dans un champ texte, jamais dans un nombre ou une date', () => {
    const data = {
      ...EXPORT_FIXTURE,
      animals: [
        { ...EXPORT_FIXTURE.animals[1]!, name: '=HYPERLINK("x")', breed: '+33 croisé' },
        { ...EXPORT_FIXTURE.animals[0]!, name: '-Luna', breed: '@home' },
      ],
      weightEntries: [{ ...EXPORT_FIXTURE.weightEntries[0]!, weightKg: -1 }],
      vaccinations: [
        { ...EXPORT_FIXTURE.vaccinations[0]!, name: '\tRage' },
        { ...EXPORT_FIXTURE.vaccinations[1]!, name: '\rToux' },
      ],
    }
    const tables = toCsvTables(data, 'kg', TODAY)

    expect(lines(tables['animaux.csv'])[1]).toContain(`;"'=HYPERLINK(""x"")";dog;'+33 croisé;`)
    expect(lines(tables['animaux.csv'])[2]).toContain(";'-Luna;cat;'@home;2019-03-02;")
    expect(lines(tables['poids.csv'])[1]).toMatch(/;2025-12-24;-1$/)
    expect(tables['vaccins.csv']).toContain(";'\tRage;")
    expect(tables['vaccins.csv']).toContain(`;"'\rToux";`)
    expect(JSON.parse(toJsonExport(data, META)).animals[0].name).toBe('=HYPERLINK("x")')
  })

  it('protège un retour à la ligne dans un champ libre', () => {
    const data = {
      ...EXPORT_FIXTURE,
      vaccinations: [{ ...EXPORT_FIXTURE.vaccinations[0]!, name: 'Rage\nrappel' }],
    }
    expect(toCsvTables(data, 'kg', TODAY)['vaccins.csv']).toContain(';"Rage\nrappel";')
  })
})

describe('buildExportFile', () => {
  it('JSON : un seul fichier texte, toujours en kg', () => {
    const file = buildExportFile('json', EXPORT_FIXTURE, META, 'lb')

    expect(file.name).toBe('memopatte-export-20260915-1030.json')
    expect(file.content).toBe(toJsonExport(EXPORT_FIXTURE, META))
    expect(JSON.parse(file.content as string).weightEntries[0].weightKg).toBe(4.25)
  })

  it('CSV : une archive zip qui contient les huit tables telles quelles', () => {
    const file = buildExportFile('csv', EXPORT_FIXTURE, META, 'lb')

    expect(file.name).toBe('memopatte-export-20260915-1030.zip')
    expect(file.content).toBeInstanceOf(Uint8Array)

    const entries = unzipSync(file.content as Uint8Array)
    const tables = toCsvTables(EXPORT_FIXTURE, 'lb', EXPORT_DAY)
    expect(Object.keys(entries)).toEqual(Object.keys(tables))
    for (const [name, csv] of Object.entries(tables)) {
      expect(Array.from(entries[name]!)).toEqual(Array.from(strToU8(csv)))
    }
    expect(entries['animaux.csv']!.slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]))
  })
})
