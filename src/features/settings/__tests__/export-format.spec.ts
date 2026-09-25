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
import { EXPORT_FIXTURE, LUNA_ID, MILO_ID } from './export-fixture'

const META = { exportedAt: new Date('2026-09-15T10:30:00'), appVersion: '0.1.24' }
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
  it('liste l’échéance de la dernière injection ou prise de chaque parent, la plus proche d’abord', () => {
    expect(exportReminders(EXPORT_FIXTURE)).toEqual([
      {
        kind: 'vaccination',
        sourceId: 'v-chppil',
        animalId: MILO_ID,
        name: 'CHPPiL',
        dueDate: '2026-09-01',
      },
      {
        kind: 'treatment',
        sourceId: 't-milbemax',
        animalId: LUNA_ID,
        name: 'Milbémax',
        dueDate: '2026-09-15',
      },
    ])
  })
})

describe('exportReminders, traitement arrêté', () => {
  const ARRETE = {
    ...EXPORT_FIXTURE,
    treatments: EXPORT_FIXTURE.treatments.map((treatment) => ({
      ...treatment,
      stoppedOn: '2026-09-10',
    })),
  }

  it('écarte un traitement arrêté des échéances du JSON et de rappels.csv', () => {
    expect(exportReminders(ARRETE).map((reminder) => reminder.sourceId)).toEqual(['v-chppil'])
    expect(lines(toCsvTables(ARRETE)['rappels.csv'])).toEqual([
      'kind;sourceId;animalId;animalName;name;dueDate',
      `vaccination;v-chppil;${MILO_ID};Milo;CHPPiL;2026-09-01`,
      '',
    ])
  })

  it('garde le traitement arrêté et sa date d’arrêt dans les traitements du JSON', () => {
    const parsed = JSON.parse(toJsonExport(ARRETE, META))

    expect(parsed.treatments).toEqual([
      expect.objectContaining({ id: 't-milbemax', stoppedOn: '2026-09-10' }),
    ])
  })
})

describe('toJsonExport', () => {
  const parsed = JSON.parse(toJsonExport(EXPORT_FIXTURE, META))

  it('versionne le document pour l’import', () => {
    expect(parsed.schemaVersion).toBe(EXPORT_SCHEMA_VERSION)
    expect(parsed.schemaVersion).toBe(2)
    expect(parsed.exportedAt).toBe(META.exportedAt.toISOString())
    expect(parsed.appVersion).toBe('0.1.24')
  })

  it('reprend toutes les données, historique compris, texte libre intact', () => {
    expect(parsed.animals).toEqual(EXPORT_FIXTURE.animals)
    expect(parsed.vaccinations).toEqual(EXPORT_FIXTURE.vaccinations)
    expect(parsed.vaccinationInjections).toEqual(EXPORT_FIXTURE.vaccinationInjections)
    expect(parsed.treatments).toEqual(EXPORT_FIXTURE.treatments)
    expect(parsed.treatmentDoses).toEqual(EXPORT_FIXTURE.treatmentDoses)
    expect(parsed.weightEntries).toEqual(EXPORT_FIXTURE.weightEntries)
    expect(parsed.reminders).toEqual(exportReminders(EXPORT_FIXTURE))
  })

  it('ne répète pas sur un parent la date ni l’échéance portées par ses événements', () => {
    expect(Object.keys(parsed.vaccinations[0])).toEqual([
      'id',
      'animalId',
      'name',
      'createdAt',
      'updatedAt',
    ])
    expect(parsed.treatments[0]).not.toHaveProperty('lastDoseDate')
    expect(parsed.treatments[0]).not.toHaveProperty('nextDueDate')
  })

  it('référence la photo par son nom de fichier, sans contenu encodé', () => {
    expect(parsed.animals[0].photoFileName).toBe('0f6c1c9e-5d6b-4b43-9a57-2f1d8b0c7a11.jpg')
    expect(toJsonExport(EXPORT_FIXTURE, META)).not.toMatch(/base64|data:image/)
  })
})

describe('toCsvTables', () => {
  const tables = toCsvTables(EXPORT_FIXTURE)

  it('produit un fichier par table', () => {
    expect(Object.keys(tables)).toEqual([
      'animaux.csv',
      'vaccins.csv',
      'injections.csv',
      'traitements.csv',
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
      'id;name;species;breed;birthDate;initialWeightKg;createdAt;updatedAt',
      `${LUNA_ID};Luna;cat;"Européen ; tigrée ""Mimi""";2019-03-02;3,8;2026-01-10T08:00:00.000Z;2026-02-01T08:00:00.000Z`,
      `${MILO_ID};Milo;dog;;;;2026-01-12T08:00:00.000Z;2026-01-12T08:00:00.000Z`,
      '',
    ])
  })

  it('exclut les photos du CSV', () => {
    expect(Object.values(tables).join('')).not.toContain('.jpg')
  })

  it('garde les dates ISO et nomme l’animal à côté de son identifiant', () => {
    expect(lines(tables['vaccins.csv'])).toEqual([
      'id;animalId;animalName;name;lastInjectionDate;dueDate',
      `v-chppil;${MILO_ID};Milo;CHPPiL;2025-09-01;2026-09-01`,
      `v-typhus;${LUNA_ID};Luna;"Typhus; coryza";2024-05-20;`,
      '',
    ])
    expect(lines(tables['traitements.csv'])).toEqual([
      'id;animalId;animalName;name;type;frequencyValue;frequencyUnit;lastDoseDate;nextDueDate',
      `t-milbemax;${LUNA_ID};Luna;Milbémax;deworming;3;month;2026-06-15;2026-09-15`,
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
      'id;treatmentId;treatmentName;animalId;animalName;givenOn;nextDueDate;frequencyValue;frequencyUnit',
      `d-milbemax-06;t-milbemax;Milbémax;${LUNA_ID};Luna;2026-06-15;2026-09-15;3;month`,
      `d-milbemax-03;t-milbemax;Milbémax;${LUNA_ID};Luna;2026-03-15;2026-06-15;3;month`,
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

  it('liste les échéances dans rappels.csv', () => {
    expect(lines(tables['rappels.csv'])).toEqual([
      'kind;sourceId;animalId;animalName;name;dueDate',
      `vaccination;v-chppil;${MILO_ID};Milo;CHPPiL;2026-09-01`,
      `treatment;t-milbemax;${LUNA_ID};Luna;Milbémax;2026-09-15`,
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
    const tables = toCsvTables(data)

    expect(lines(tables['animaux.csv'])[1]).toContain(`;"'=HYPERLINK(""x"")";dog;'+33 croisé;`)
    expect(lines(tables['animaux.csv'])[2]).toContain(";'-Luna;cat;'@home;2019-03-02;3,8;")
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
    expect(toCsvTables(data)['vaccins.csv']).toContain(';"Rage\nrappel";')
  })
})

describe('buildExportFile', () => {
  it('JSON : un seul fichier texte', () => {
    const file = buildExportFile('json', EXPORT_FIXTURE, META)

    expect(file.name).toBe('memopatte-export-20260915-1030.json')
    expect(file.content).toBe(toJsonExport(EXPORT_FIXTURE, META))
  })

  it('CSV : une archive zip qui contient les sept tables telles quelles', () => {
    const file = buildExportFile('csv', EXPORT_FIXTURE, META)

    expect(file.name).toBe('memopatte-export-20260915-1030.zip')
    expect(file.content).toBeInstanceOf(Uint8Array)

    const entries = unzipSync(file.content as Uint8Array)
    const tables = toCsvTables(EXPORT_FIXTURE)
    expect(Object.keys(entries)).toEqual(Object.keys(tables))
    for (const [name, csv] of Object.entries(tables)) {
      expect(Array.from(entries[name]!)).toEqual(Array.from(strToU8(csv)))
    }
    expect(entries['animaux.csv']!.slice(0, 3)).toEqual(new Uint8Array([0xef, 0xbb, 0xbf]))
  })
})
