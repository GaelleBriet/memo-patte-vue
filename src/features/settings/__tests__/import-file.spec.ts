import { afterEach, describe, expect, it, vi } from 'vitest'

import { parseExportFile } from '../service/data-import.service'
import { IMPORT_FILE, IMPORT_FIXTURE, importFixtureJson, LUNA_ID, MILO_ID } from './import-fixture'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const LIMITE = 'a'.repeat(MAX_NAME_LENGTH)
const TROP_LONG = `${LIMITE}a`
const INVALID = { ok: false, reason: 'invalid' }

type Document = Record<string, unknown>
type Row = Record<string, unknown>

function rows(document: Document, table: string): Row[] {
  return document[table] as Row[]
}

function premier(document: Document, table: string): Row {
  return rows(document, table)[0]!
}

/** Période et prises du traitement quotidien à deux heures du fichier de test. */
function panacur(document: Document) {
  const [, period] = rows(document, 'treatmentPeriods')
  const [, report, soir, matin] = rows(document, 'treatmentDoses')
  return { period: period!, report: report!, soir: soir!, matin: matin! }
}

const NOMS: [string, (document: Document, value: string) => void][] = [
  ['le nom d’un animal', (document, value) => (premier(document, 'animals').name = value)],
  ['la race d’un animal', (document, value) => (premier(document, 'animals').breed = value)],
  ['le nom d’un vaccin', (document, value) => (premier(document, 'vaccinations').name = value)],
  ['le nom d’un traitement', (document, value) => (premier(document, 'treatments').name = value)],
]

function withDocument(change: (document: Document) => void): string {
  const document = JSON.parse(importFixtureJson()) as Document
  change(document)
  return JSON.stringify(document)
}

function forged(table: string, field: string, value: unknown, index = 0): string {
  return withDocument((document) => {
    rows(document, table)[index]![field] = value
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('parseExportFile', () => {
  it('relit un export JSON de l’app à l’identique, sans les rappels dérivés', () => {
    const result = parseExportFile(importFixtureJson())

    expect(result).toEqual({ ok: true, file: IMPORT_FILE })
  })

  it('accepte un champ inconnu, sans le garder : un ajout optionnel ne change pas la version', () => {
    const text = withDocument((document) => {
      document.theme = 'dark'
      premier(document, 'animals').color = 'tabby'
      premier(document, 'treatmentDoses').frequency = { value: 3, unit: 'month' }
    })

    expect(parseExportFile(text)).toEqual({ ok: true, file: IMPORT_FILE })
  })

  it('relit un carnet dont les réglages n’ont jamais été touchés', () => {
    const result = parseExportFile(withDocument((document) => (document.carnetSettings = null)))

    expect(result.ok && result.file.data.carnetSettings).toBeNull()
  })

  it('accepte un vaccin sans injection', () => {
    const result = parseExportFile(
      withDocument((document) => (document.vaccinationInjections = [])),
    )

    expect(result.ok).toBe(true)
  })

  it('accepte le type « médicament »', () => {
    const result = parseExportFile(forged('treatments', 'type', 'medication'))

    expect(result.ok && result.file.data.treatments[0]?.type).toBe('medication')
  })

  it('accepte un traitement sans aucune prise', () => {
    const text = withDocument((document) => {
      document.treatmentDoses = rows(document, 'treatmentDoses').slice(1)
    })
    const result = parseExportFile(text)

    expect(result.ok && result.file.data.treatmentDoses).toHaveLength(3)
    expect(result.ok && result.file.data.treatments).toHaveLength(2)
  })

  describe('instants', () => {
    it.each([
      ['sans secondes', '2026-02-01T08:00Z', '2026-02-01T08:00:00.000Z'],
      ['sans millisecondes', '2026-02-01T08:00:30Z', '2026-02-01T08:00:30.000Z'],
      ['au dixième', '2026-02-01T08:00:30.5Z', '2026-02-01T08:00:30.500Z'],
      ['à la nanoseconde', '2026-02-01T08:00:30.123456789Z', '2026-02-01T08:00:30.123Z'],
    ])('réécrit un instant %s dans la forme que l’app enregistre', (_, written, canonical) => {
      const result = parseExportFile(
        withDocument((document) => {
          premier(document, 'animals').updatedAt = written
          premier(document, 'treatmentDoses').createdAt = written
          ;(document.carnetSettings as Row).updatedAt = written
        }),
      )

      expect(result.ok && result.file.data.animals[0]!.updatedAt).toBe(canonical)
      expect(result.ok && result.file.data.treatmentDoses[0]!.createdAt).toBe(canonical)
      expect(result.ok && result.file.data.carnetSettings!.updatedAt).toBe(canonical)
    })
  })

  describe('nom de photo', () => {
    it.each([
      '../photo.jpg',
      '../../databases/memopatte.db',
      '/etc/passwd',
      'dossier/photo.jpg',
      'dossier\\photo.jpg',
      'https://exemple.fr/photo.jpg',
      'photo.png',
      'photo.jpg.exe',
      '.jpg',
      'photo.jpg\u0000',
      'pho to.jpg',
      '',
    ])('refuse « %s »', (photoFileName) => {
      expect(parseExportFile(forged('animals', 'photoFileName', photoFileName))).toEqual(INVALID)
    })

    it.each(['0f6c1c9e-5d6b-4b43-9a57-2f1d8b0c7a11.jpg', 'Photo_1.jpg', null])(
      'accepte « %s »',
      (photoFileName) => {
        expect(parseExportFile(forged('animals', 'photoFileName', photoFileName)).ok).toBe(true)
      },
    )
  })

  describe('version', () => {
    it.each([1, 2, 3])(
      'signale un export d’une version plus ancienne (v%i), quel que soit son contenu',
      (schemaVersion) => {
        expect(parseExportFile(JSON.stringify({ schemaVersion, animals: [] }))).toEqual({
          ok: false,
          reason: 'older',
        })
        expect(
          parseExportFile(withDocument((document) => (document.schemaVersion = schemaVersion))),
        ).toEqual({ ok: false, reason: 'older' })
      },
    )

    it('signale un export d’une version plus récente, quel que soit son contenu', () => {
      const text = JSON.stringify({ schemaVersion: 5, pets: [] })

      expect(parseExportFile(text)).toEqual({ ok: false, reason: 'newer' })
    })

    it.each([
      ['du texte qui n’est pas du JSON', 'bonjour'],
      ['un fichier vide', ''],
      ['un JSON sans version', JSON.stringify({ animals: [] })],
      ['un tableau', '[]'],
      ['`null`', 'null'],
      ['une version en texte', withDocument((document) => (document.schemaVersion = '3'))],
      ['une version décimale', withDocument((document) => (document.schemaVersion = 3.5))],
      ['une version nulle ou négative', withDocument((document) => (document.schemaVersion = 0))],
    ])('refuse %s comme un fichier qui n’est pas un export MémoPatte', (_, text) => {
      expect(parseExportFile(text)).toEqual(INVALID)
    })
  })

  describe('forme du fichier', () => {
    it.each([
      'carnetSettings',
      'animals',
      'vaccinations',
      'vaccinationInjections',
      'treatments',
      'treatmentPeriods',
      'treatmentDoses',
      'weightEntries',
    ])('refuse un fichier sans `%s`', (table) => {
      expect(parseExportFile(withDocument((document) => delete document[table]))).toEqual(INVALID)
    })

    it.each([
      ['une table qui n’est pas un tableau', (document: Document) => (document.animals = {})],
      ['une ligne qui n’est pas un objet', (document: Document) => (document.animals = ['Luna'])],
      ['un tableau à la place d’un objet', (document: Document) => (document.carnetSettings = [])],
    ])('refuse %s', (_, change) => {
      expect(parseExportFile(withDocument(change))).toEqual(INVALID)
    })

    it('ne se laisse pas polluer par une clé `__proto__` du fichier', () => {
      const text = importFixtureJson().replace(
        '"animals": [',
        '"__proto__": { "polluted": true }, "animals": [',
      )

      const result = parseExportFile(text)

      expect(result).toEqual({ ok: true, file: IMPORT_FILE })
      expect(({} as Record<string, unknown>).polluted).toBeUndefined()
      expect(result.ok && Object.keys(result.file.data)).not.toContain('__proto__')
    })
  })

  describe('champs forgés', () => {
    it.each([
      ['une espèce inconnue', forged('animals', 'species', 'rabbit')],
      ['un identifiant qui n’est pas un UUID', forged('vaccinations', 'id', 'v-1')],
      ['un identifiant porteur de SQL', forged('animals', 'id', "x'; DROP TABLE animal; --")],
      ['un `animalId` qui n’est pas un UUID', forged('weightEntries', 'animalId', '1 OR 1=1')],
      ['un nom qui n’est pas du texte', forged('animals', 'name', { toString: 'Luna' })],
      ['un nom vide', forged('animals', 'name', '   ')],
      [
        'un nom de photo de plus de 200 caractères',
        forged('animals', 'photoFileName', 'a'.repeat(201)),
      ],
      [
        'une date approximative qui n’est pas un booléen',
        forged('animals', 'birthDateApproximate', 1),
      ],
      [
        'un animal sans `birthDateApproximate`',
        forged('animals', 'birthDateApproximate', undefined),
      ],
      ['un motif de départ inconnu', forged('animals', 'departureReason', 'sold')],
      ['une date de départ illisible', forged('animals', 'departureDate', 'hier')],
      ['une date de retrait hors du calendrier', forged('animals', 'unfollowedOn', '2026-02-30')],
      ['une date de naissance dans le futur', forged('animals', 'birthDate', '2999-01-01')],
      ['une date de naissance avant 1900', forged('animals', 'birthDate', '1899-12-31')],
      ['un rappel prévu après 2199', forged('vaccinations', 'plannedDueDate', '2200-01-01')],
      ['une date civile au mauvais format', forged('weightEntries', 'measuredOn', '24/12/2025')],
      ['une date suivie d’autre chose', forged('weightEntries', 'measuredOn', '2025-12-24\n')],
      [
        'un 29 février d’une année non bissextile',
        forged('weightEntries', 'measuredOn', '2025-02-29'),
      ],
      ['une pesée dans le futur', forged('weightEntries', 'measuredOn', '2999-01-01')],
      ['une injection dans le futur', forged('vaccinationInjections', 'injectedOn', '2999-01-01')],
      ['un poids nul', forged('weightEntries', 'weightKg', 0)],
      ['un poids en texte', forged('weightEntries', 'weightKg', '4,25')],
      [
        'un instant avec un décalage horaire au lieu de UTC',
        forged('animals', 'updatedAt', '2026-02-01T09:00:00+01:00'),
      ],
      ['un instant avant 1900', forged('animals', 'createdAt', '1899-12-31T23:59:59.000Z')],
      ['un instant après 2199', forged('animals', 'updatedAt', '2200-01-01T00:00:00.000Z')],
      ['un instant qui n’est pas du texte', forged('animals', 'updatedAt', 1_769_904_000_000)],
      ['un type de traitement inconnu', forged('treatments', 'type', 'vaccine')],
      [
        'un traitement qui porte encore sa fréquence, sans période',
        withDocument((document) => {
          document.treatmentPeriods = rows(document, 'treatmentPeriods').slice(1)
          document.treatmentDoses = rows(document, 'treatmentDoses').slice(1)
        }),
      ],
    ])('refuse %s', (_, text) => {
      expect(parseExportFile(text)).toEqual(INVALID)
    })

    it.each([
      ['une heure des rappels de vaccins à 24 h', { vaccineReminderTime: '24:00' }],
      ['une heure des rappels de vaccins sans minutes', { vaccineReminderTime: '9h' }],
      ['un « Me prévenir avant » qui n’est pas un booléen', { remindBeforeDue: 'false' }],
      ['des réglages datés hors bornes', { updatedAt: '2200-01-01T00:00:00.000Z' }],
    ])('refuse %s', (_, change) => {
      const text = withDocument((document) => {
        Object.assign(document.carnetSettings as Row, change)
      })

      expect(parseExportFile(text)).toEqual(INVALID)
    })
  })

  describe('périodes forgées', () => {
    it.each([
      ['une fréquence nulle', { frequency: { value: 0, unit: 'day' } }],
      ['une fréquence décimale', { frequency: { value: 1.5, unit: 'day' } }],
      ['une unité de fréquence inconnue', { frequency: { value: 1, unit: 'year' } }],
      ['une fréquence en texte', { frequency: 'daily' }],
      ['un début illisible', { startsOn: 'demain' }],
      ['une première échéance hors du calendrier', { firstDueOn: '2026-13-01' }],
      ['une date de fin avant 1900', { endsOn: '1800-01-01' }],
      ['une date d’arrêt après 2199', { stoppedOn: '9999-12-31' }],
      ['des heures en texte plutôt qu’en liste', { times: '08:00,20:00' }],
      ['une heure à 24 h', { times: ['24:00'] }],
      ['une heure sans zéro initial', { times: ['8:00'] }],
      ['une heure avec des secondes', { times: ['08:00:00'] }],
      ['une heure en double', { times: ['08:00', '08:00'] }],
      ['une heure qui n’est pas du texte', { times: [800] }],
      ['un moment du rappel hors de la liste', { reminderOffsetMinutes: 45 }],
      ['un moment du rappel en texte', { reminderOffsetMinutes: '30' }],
      ['une heure de rappel illisible', { reminderTime: '9 h' }],
      ['une période sans `times`', { times: undefined }],
    ])('refuse %s', (_, change) => {
      const text = withDocument((document) => Object.assign(panacur(document).period, change))

      expect(parseExportFile(text)).toEqual(INVALID)
    })

    it.each([
      ['une date de fin avant le début', { endsOn: '2026-08-31' }],
      ['une date d’arrêt avant le début', { stoppedOn: '2026-08-31' }],
      ['une première échéance avant le début', { firstDueOn: '2026-08-31' }],
      [
        'plus de 24 heures par jour',
        {
          times: Array.from(
            { length: 25 },
            (_, index) => `0${Math.floor(index / 10)}:${index % 10}0`,
          ),
        },
      ],
    ])('refuse %s', (_, change) => {
      const text = withDocument((document) => Object.assign(panacur(document).period, change))

      expect(parseExportFile(text)).toEqual(INVALID)
    })

    it('accepte une fin, un arrêt et une première échéance le jour du début, et 24 heures par jour', () => {
      const text = withDocument((document) =>
        Object.assign(panacur(document).period, {
          endsOn: '2026-09-01',
          stoppedOn: '2026-09-01',
          firstDueOn: '2026-09-01',
          times: Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`),
        }),
      )

      expect(parseExportFile(text).ok).toBe(true)
    })

    it.each([
      ['une quantité nulle', { doseQuantity: 0 }],
      ['une quantité négative', { doseQuantity: -1 }],
      ['une quantité en texte', { doseQuantity: '½' }],
      ['une unité inconnue', { doseUnit: 'louche' }],
      ['une quantité sans unité', { doseUnit: null }],
      ['une unité sans quantité', { doseQuantity: null }],
    ])('vérifie la posologie : refuse %s', (_, change) => {
      const text = withDocument((document) => Object.assign(panacur(document).period, change))

      expect(parseExportFile(text)).toEqual(INVALID)
    })

    it('accepte les onze unités de posologie, et une période sans posologie', () => {
      const units = [
        'tablet',
        'capsule',
        'pipette',
        'collar',
        'ml',
        'drop',
        'g',
        'sachet',
        'spray',
        'application',
        'dose',
      ]

      for (const doseUnit of units) {
        expect(parseExportFile(forged('treatmentPeriods', 'doseUnit', doseUnit, 1)).ok).toBe(true)
      }
      expect(
        parseExportFile(
          withDocument((document) =>
            Object.assign(panacur(document).period, { doseQuantity: null, doseUnit: null }),
          ),
        ).ok,
      ).toBe(true)
    })

    it.each([0, 15, 30, 60, null])('accepte le moment du rappel %s', (reminderOffsetMinutes) => {
      const text = forged('treatmentPeriods', 'reminderOffsetMinutes', reminderOffsetMinutes, 1)

      expect(parseExportFile(text).ok).toBe(true)
    })
  })

  describe('prises forgées', () => {
    it.each([
      ['un état inconnu', { status: 'skipped' }],
      ['une prise donnée sans date réelle', { status: 'given', givenOn: null }],
      ['une prise oubliée avec une date réelle', { status: 'missed', givenOn: '2026-09-01' }],
      ['un report avec une date réelle', { status: 'postponed', givenOn: '2026-09-01' }],
      ['une date réelle dans le futur', { givenOn: '2999-01-01' }],
      ['une échéance illisible', { dueOn: '10/09/2026' }],
      ['une heure d’échéance à 25 h', { dueTime: '25:00' }],
      ['une prochaine échéance absente', { nextDueDate: null }],
      ['une prochaine échéance après 2199', { nextDueDate: '2200-01-01' }],
      ['une période qui n’est pas un UUID', { periodId: 'p-1' }],
      ['une prise sans période', { periodId: undefined }],
      ['une prise en plus, que l’app ne sait pas encore lire', { status: 'extra' }],
      [
        'une ligne de décalage, que l’app ne sait pas encore lire',
        { status: 'shift', givenOn: null },
      ],
      ['une prise sans l’appareil qui l’a créée', { createdByDevice: undefined }],
      ['un appareil qui n’est pas un UUID', { updatedByDevice: 'pixel' }],
    ])('refuse %s', (_, change) => {
      const text = withDocument((document) => Object.assign(panacur(document).matin, change))

      expect(parseExportFile(text)).toEqual(INVALID)
    })

    it('accepte une prise donnée en retard, une oubliée et un report', () => {
      const result = parseExportFile(
        withDocument((document) => {
          Object.assign(panacur(document).matin, { givenOn: '2026-09-12' })
        }),
      )

      expect(
        result.ok &&
          result.file.data.treatmentDoses.map(({ status, givenOn }) => [status, givenOn]),
      ).toEqual([
        ['given', '2026-06-15'],
        ['postponed', null],
        ['missed', null],
        ['given', '2026-09-12'],
      ])
    })
  })

  describe('jour de référence et appareils', () => {
    it('relit le jour de référence de chaque période et les appareils du carnet', () => {
      const result = parseExportFile(importFixtureJson())

      expect(
        result.ok && result.file.data.treatmentPeriods.map((period) => period.referenceOn),
      ).toEqual(['2026-06-15', '2026-09-01'])
      expect(result.ok && result.file.data.devices).toEqual(IMPORT_FIXTURE.devices)
    })

    it.each([
      ['une période sans jour de référence', 'treatmentPeriods', { referenceOn: undefined }],
      ['un appareil sans date d’installation', 'devices', { installedAt: undefined }],
      ['un modèle d’appareil de plus de 200 caractères', 'devices', { model: 'a'.repeat(201) }],
    ])('refuse %s', (_, table, change) => {
      const text = withDocument((document) => Object.assign(rows(document, table)[0]!, change))

      expect(parseExportFile(text)).toEqual(INVALID)
    })

    it('refuse un fichier sans liste d’appareils', () => {
      const text = withDocument((document) => {
        delete document.devices
      })

      expect(parseExportFile(text)).toEqual(INVALID)
    })
  })

  describe('limites nommées', () => {
    it.each([
      ['une pesée hors bornes', forged('weightEntries', 'weightKg', 1e308)],
      [
        'une fréquence de traitement hors bornes',
        forged('treatmentPeriods', 'frequency', { value: 10_000_000, unit: 'month' }),
      ],
      [
        'une fréquence de 366',
        forged('treatmentPeriods', 'frequency', { value: 366, unit: 'day' }),
      ],
    ])('dit pourquoi il refuse %s, plutôt que « ce n’est pas un export »', (_, text) => {
      expect(parseExportFile(text)).toEqual({ ok: false, reason: 'outOfRange' })
    })

    it('accepte une fréquence de 365 et un poids de 200 kg', () => {
      const text = withDocument((document) => {
        premier(document, 'treatmentPeriods').frequency = { value: 365, unit: 'day' }
        premier(document, 'weightEntries').weightKg = 200
      })

      expect(parseExportFile(text).ok).toBe(true)
    })

    it('reste « pas un export » quand le poids hors bornes n’est pas le seul défaut', () => {
      const text = withDocument((document) => {
        premier(document, 'weightEntries').weightKg = 201
        premier(document, 'animals').species = 'rabbit'
      })

      expect(parseExportFile(text)).toEqual(INVALID)
    })

    it.each(NOMS)(
      'refuse en entier un fichier dont %s dépasse 80 caractères, avec son propre motif',
      (_, poser) => {
        const text = withDocument((document) => poser(document, TROP_LONG))

        expect(parseExportFile(text)).toEqual({ ok: false, reason: 'nameTooLong' })
      },
    )

    it('accepte des noms et une race de 80 caractères, espaces du bord non comptés', () => {
      const text = withDocument((document) => {
        for (const [, poser] of NOMS) poser(document, ` ${LIMITE} `)
      })

      const result = parseExportFile(text)

      expect(result.ok && result.file.data.animals[0]).toMatchObject({
        name: LIMITE,
        breed: LIMITE,
      })
    })

    it('reste « pas un export » quand le nom trop long n’est pas le seul défaut', () => {
      const text = withDocument((document) => {
        premier(document, 'animals').name = TROP_LONG
        premier(document, 'animals').species = 'rabbit'
      })

      expect(parseExportFile(text)).toEqual(INVALID)
    })

    it('lit une race vide comme absente, et nettoie les espaces des textes', () => {
      const text = withDocument((document) => {
        const [luna, milo] = rows(document, 'animals')
        luna!.breed = '   '
        milo!.name = '  Milo  '
      })

      const result = parseExportFile(text)

      expect(result.ok && result.file.data.animals.map(({ name, breed }) => [name, breed])).toEqual(
        [
          ['Luna', null],
          ['Milo', null],
        ],
      )
    })
  })

  describe('cohérence du fichier', () => {
    it.each([
      'animals',
      'vaccinations',
      'vaccinationInjections',
      'treatments',
      'treatmentPeriods',
      'treatmentDoses',
      'weightEntries',
    ])('refuse un identifiant en double dans `%s`', (table) => {
      const text = withDocument((document) => {
        const [first, second] = rows(document, table)
        second!.id = first!.id
      })

      expect(parseExportFile(text)).toEqual(INVALID)
    })

    it('refuse une entrée rattachée à un animal absent du fichier', () => {
      const text = withDocument((document) => {
        document.animals = rows(document, 'animals').filter((animal) => animal.id !== MILO_ID)
      })

      expect(parseExportFile(text)).toEqual(INVALID)
    })

    it.each(['treatmentPeriods', 'treatmentDoses', 'vaccinationInjections'])(
      'refuse une ligne de `%s` rattachée à un animal absent du fichier',
      (table) => {
        const text = forged(table, 'animalId', '12345678-1234-4234-8234-123456789012')

        expect(parseExportFile(text)).toEqual(INVALID)
      },
    )

    it('garde un animal sans carnet', () => {
      const text = withDocument((document) => {
        for (const table of Object.keys(document)) {
          if (Array.isArray(document[table]) && table !== 'animals') document[table] = []
        }
      })

      const result = parseExportFile(text)

      expect(result.ok && result.file.data.animals.map(({ id }) => id)).toEqual([LUNA_ID, MILO_ID])
    })
  })

  it('n’écrit rien du fichier dans les journaux, accepté ou refusé', () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      vi.spyOn(console, level).mockImplementation(() => undefined),
    )

    parseExportFile(importFixtureJson())
    parseExportFile(forged('animals', 'name', TROP_LONG))
    parseExportFile('{ "schemaVersion": 4, "animals": "secret" }')
    parseExportFile('secret')

    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  })
})
