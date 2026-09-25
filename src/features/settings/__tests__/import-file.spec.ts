import { describe, expect, it } from 'vitest'

import { parseExportFile } from '../service/data-import.service'
import { IMPORT_FILE, importFixtureJson, LUNA_ID, MILO_ID } from './import-fixture'
import exportV1 from './fixtures/export-v1-0.1.37.json?raw'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const LIMITE = 'a'.repeat(MAX_NAME_LENGTH)
const TROP_LONG = `${LIMITE}a`

type Document = Record<string, unknown>

function premier(document: Document, table: string): Document {
  return (document[table] as Document[])[0]!
}

const NOMS: [string, (document: Document, value: string) => void][] = [
  ['le nom d’un animal', (document, value) => (premier(document, 'animals').name = value)],
  ['la race d’un animal', (document, value) => (premier(document, 'animals').breed = value)],
  ['le nom d’un vaccin', (document, value) => (premier(document, 'vaccinations').name = value)],
  ['le nom d’un traitement', (document, value) => (premier(document, 'treatments').name = value)],
]

function withDocument(change: (document: Record<string, unknown>) => void): string {
  const document = JSON.parse(importFixtureJson()) as Record<string, unknown>
  change(document)
  return JSON.stringify(document)
}

describe('parseExportFile', () => {
  it('relit un export JSON de l’app à l’identique, sans les rappels dérivés', () => {
    const result = parseExportFile(importFixtureJson())

    expect(result).toEqual({ ok: true, file: IMPORT_FILE })
  })

  it('accepte un champ inconnu : un ajout optionnel ne change pas la version', () => {
    const text = withDocument((document) => {
      document.theme = 'dark'
      ;(document.animals as Record<string, unknown>[])[0]!.color = 'tabby'
    })

    expect(parseExportFile(text)).toEqual({ ok: true, file: IMPORT_FILE })
  })

  it.each([
    ['du texte qui n’est pas du JSON', 'bonjour'],
    ['un JSON sans version', JSON.stringify({ animals: [] })],
    ['un tableau', '[]'],
    ['une version non entière', withDocument((document) => (document.schemaVersion = '1'))],
    ['une table manquante', withDocument((document) => delete document.treatments)],
    [
      'une espèce inconnue',
      withDocument((document) => {
        ;(document.animals as Record<string, unknown>[])[0]!.species = 'rabbit'
      }),
    ],
    [
      'un identifiant qui n’est pas un UUID',
      withDocument((document) => {
        ;(document.vaccinations as Record<string, unknown>[])[0]!.id = 'v-1'
      }),
    ],
    [
      'un instant avec un décalage horaire au lieu de UTC',
      withDocument((document) => {
        ;(document.animals as Record<string, unknown>[])[0]!.updatedAt = '2026-02-01T09:00:00+01:00'
      }),
    ],
    [
      'une injection dans le futur',
      withDocument((document) => {
        ;(document.vaccinationInjections as Record<string, unknown>[])[0]!.injectedOn = '2999-01-01'
      }),
    ],
    [
      'une prise dans le futur',
      withDocument((document) => {
        ;(document.treatmentDoses as Record<string, unknown>[])[0]!.givenOn = '2999-01-01'
      }),
    ],
    [
      'un traitement sans date d’arrêt ni `null`',
      withDocument((document) => {
        delete (document.treatments as Record<string, unknown>[])[0]!.stoppedOn
      }),
    ],
    [
      'une table d’événements manquante',
      withDocument((document) => delete document.treatmentDoses),
    ],
    [
      'une date de naissance dans le futur',
      withDocument((document) => {
        ;(document.animals as Record<string, unknown>[])[0]!.birthDate = '2999-01-01'
      }),
    ],
    [
      'une date civile invalide',
      withDocument((document) => {
        ;(document.weightEntries as Record<string, unknown>[])[0]!.measuredOn = '24/12/2025'
      }),
    ],
  ])('refuse %s comme un fichier qui n’est pas un export MémoPatte', (_, text) => {
    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'invalid' })
  })

  it.each([
    [
      'une pesée hors bornes',
      withDocument((document) => {
        ;(document.weightEntries as Record<string, unknown>[])[0]!.weightKg = 1e308
      }),
    ],
    [
      'un poids initial hors bornes',
      withDocument((document) => {
        ;(document.animals as Record<string, unknown>[])[0]!.initialWeightKg = 201
      }),
    ],
    [
      'une fréquence de traitement hors bornes',
      withDocument((document) => {
        ;(document.treatments as Record<string, unknown>[])[0]!.frequency = {
          value: 10_000_000,
          unit: 'month',
        }
      }),
    ],
  ])('dit pourquoi il refuse %s, plutôt que « ce n’est pas un export »', (_, text) => {
    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'outOfRange' })
  })

  it('reste « pas un export » quand le poids hors bornes n’est pas le seul défaut', () => {
    const text = withDocument((document) => {
      ;(document.animals as Record<string, unknown>[])[0]!.initialWeightKg = 201
      ;(document.animals as Record<string, unknown>[])[0]!.species = 'rabbit'
    })

    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'invalid' })
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

    expect(result.ok && result.file.data.animals[0]).toMatchObject({ name: LIMITE, breed: LIMITE })
  })

  it('reste « pas un export » quand le nom trop long n’est pas le seul défaut', () => {
    const text = withDocument((document) => {
      premier(document, 'animals').name = TROP_LONG
      premier(document, 'animals').species = 'rabbit'
    })

    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('lit une race vide comme absente, et nettoie les espaces des textes', () => {
    const text = withDocument((document) => {
      const [luna, milo] = document.animals as Record<string, unknown>[]
      luna!.breed = '   '
      milo!.name = '  Milo  '
    })

    const result = parseExportFile(text)

    expect(result.ok && result.file.data.animals.map(({ name, breed }) => [name, breed])).toEqual([
      ['Luna', null],
      ['Milo', null],
    ])
  })

  it('signale un export d’une version plus récente, quel que soit son contenu', () => {
    const text = JSON.stringify({ schemaVersion: 3, pets: [] })

    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'newer' })
  })

  it('refuse un identifiant en double dans une même table', () => {
    const text = withDocument((document) => {
      const animals = document.animals as Record<string, unknown>[]
      animals[1]!.id = LUNA_ID
    })

    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuse un identifiant en double parmi les événements', () => {
    const text = withDocument((document) => {
      const injections = document.vaccinationInjections as Record<string, unknown>[]
      injections[1]!.id = injections[0]!.id
    })

    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'invalid' })
  })

  it.each([
    ['un vaccin', 'vaccinationInjections'],
    ['un traitement', 'treatmentDoses'],
  ])('refuse %s sans aucun événement dans le fichier', (_, table) => {
    const text = withDocument((document) => {
      document[table] = (document[table] as Record<string, unknown>[]).slice(1)
    })

    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuse une entrée rattachée à un animal absent du fichier', () => {
    const text = withDocument((document) => {
      document.animals = (document.animals as Record<string, unknown>[]).filter(
        (animal) => animal.id !== MILO_ID,
      )
    })

    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('parseExportFile, export v1', () => {
  const RAGE = 'c926e5b4-b1c3-4773-bb3f-34e0acdb67da'
  const MILBEMAX = 'e4d428da-419e-4c67-a6f3-fcad10a2c6ff'
  const MILO = 'f53143ec-dca0-430d-a77d-755f592ae425'

  function withV1Document(change: (document: Record<string, unknown>) => void): string {
    const document = JSON.parse(exportV1) as Record<string, unknown>
    change(document)
    return JSON.stringify(document)
  }

  function v1Data(text: string) {
    const result = parseExportFile(text)
    if (!result.ok || result.file.schemaVersion !== 1) throw new Error('export v1 refusé')
    return result.file.data
  }

  it('relit un vrai export de la 0.1.37 : un événement par ligne, à l’identifiant du parent', () => {
    const data = v1Data(exportV1)

    expect(data.vaccinations).toHaveLength(3)
    expect(data.vaccinationInjections).toHaveLength(3)
    expect(data.vaccinations).toContainEqual({
      id: RAGE,
      animalId: MILO,
      name: 'Rage',
      createdAt: '2026-09-20T07:20:10.533Z',
      updatedAt: '2026-09-21T18:02:57.061Z',
    })
    expect(data.vaccinationInjections).toContainEqual({
      id: RAGE,
      vaccinationId: RAGE,
      animalId: MILO,
      injectedOn: '2026-09-21',
      nextDueDate: '2029-09-21',
      createdAt: '2026-09-20T07:20:10.533Z',
      updatedAt: '2026-09-21T18:02:57.061Z',
    })
    expect(data.treatments.every(({ stoppedOn }) => stoppedOn === null)).toBe(true)
    expect(data.treatmentDoses).toContainEqual({
      id: MILBEMAX,
      treatmentId: MILBEMAX,
      animalId: MILO,
      givenOn: '2026-09-15',
      nextDueDate: '2026-12-15',
      frequency: { value: 3, unit: 'month' },
      createdAt: '2026-09-20T07:29:03.672Z',
      updatedAt: '2026-09-22T08:41:19.230Z',
    })
    expect(data.weightEntries).toHaveLength(3)
  })

  it('lit la date d’arrêt d’un export v1 plus récent', () => {
    const text = withV1Document((document) => {
      ;(document.treatments as Record<string, unknown>[])[0]!.stoppedOn = '2026-09-10'
    })

    expect(v1Data(text).treatments[0]!.stoppedOn).toBe('2026-09-10')
  })

  it('aiguille par la version avant de valider : chaque format a son schéma', () => {
    const v1LikeV2 = JSON.stringify({ ...JSON.parse(importFixtureJson()), schemaVersion: 1 })
    const v2LikeV1 = withV1Document((document) => (document.schemaVersion = 2))

    expect(parseExportFile(v1LikeV2)).toEqual({ ok: false, reason: 'invalid' })
    expect(parseExportFile(v2LikeV1)).toEqual({ ok: false, reason: 'invalid' })
  })

  it.each(NOMS)('refuse un export v1 dont %s dépasse 80 caractères', (_, poser) => {
    const text = withV1Document((document) => poser(document, TROP_LONG))

    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'nameTooLong' })
  })

  it('accepte un export v1 aux noms et à la race de 80 caractères', () => {
    const text = withV1Document((document) => {
      for (const [, poser] of NOMS) poser(document, LIMITE)
    })

    expect(v1Data(text).animals[0]).toMatchObject({ name: LIMITE, breed: LIMITE })
  })

  it('garde les refus du format v1', () => {
    const heavy = withV1Document((document) => {
      ;(document.weightEntries as Record<string, unknown>[])[0]!.weightKg = 201
    })
    const future = withV1Document((document) => {
      ;(document.vaccinations as Record<string, unknown>[])[0]!.lastInjectionDate = '2999-01-01'
    })

    expect(parseExportFile(heavy)).toEqual({ ok: false, reason: 'outOfRange' })
    expect(parseExportFile(future)).toEqual({ ok: false, reason: 'invalid' })
  })
})
