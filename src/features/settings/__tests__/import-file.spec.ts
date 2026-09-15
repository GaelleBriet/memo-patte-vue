import { describe, expect, it } from 'vitest'

import { parseExportFile } from '../data-import.service'
import { IMPORT_FIXTURE, importFixtureJson, LUNA_ID, MILO_ID } from './import-fixture'

function withDocument(change: (document: Record<string, unknown>) => void): string {
  const document = JSON.parse(importFixtureJson()) as Record<string, unknown>
  change(document)
  return JSON.stringify(document)
}

describe('parseExportFile', () => {
  it('relit un export JSON de l’app à l’identique, sans les rappels dérivés', () => {
    const result = parseExportFile(importFixtureJson())

    expect(result).toEqual({ ok: true, data: IMPORT_FIXTURE })
  })

  it('accepte un champ inconnu : un ajout optionnel ne change pas la version', () => {
    const text = withDocument((document) => {
      document.theme = 'dark'
      ;(document.animals as Record<string, unknown>[])[0]!.color = 'tabby'
    })

    expect(parseExportFile(text)).toEqual({ ok: true, data: IMPORT_FIXTURE })
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
      'une date de dernière injection dans le futur',
      withDocument((document) => {
        ;(document.vaccinations as Record<string, unknown>[])[0]!.lastInjectionDate = '2999-01-01'
      }),
    ],
    [
      'une date de naissance dans le futur',
      withDocument((document) => {
        ;(document.animals as Record<string, unknown>[])[0]!.birthDate = '2999-01-01'
      }),
    ],
    [
      'un nom trop long',
      withDocument((document) => {
        ;(document.treatments as Record<string, unknown>[])[0]!.name = 'x'.repeat(201)
      }),
    ],
    [
      'une fréquence de traitement démesurée',
      withDocument((document) => {
        ;(document.treatments as Record<string, unknown>[])[0]!.frequency = {
          value: 10_000_000,
          unit: 'month',
        }
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

  it('lit une race vide comme absente, et nettoie les espaces des textes', () => {
    const text = withDocument((document) => {
      const [luna, milo] = document.animals as Record<string, unknown>[]
      luna!.breed = '   '
      milo!.name = '  Milo  '
    })

    const result = parseExportFile(text)

    expect(result.ok && result.data.animals.map(({ name, breed }) => [name, breed])).toEqual([
      ['Luna', null],
      ['Milo', null],
    ])
  })

  it('signale un export d’une version plus récente, quel que soit son contenu', () => {
    const text = JSON.stringify({ schemaVersion: 2, pets: [] })

    expect(parseExportFile(text)).toEqual({ ok: false, reason: 'newer' })
  })

  it('refuse un identifiant en double dans une même table', () => {
    const text = withDocument((document) => {
      const animals = document.animals as Record<string, unknown>[]
      animals[1]!.id = LUNA_ID
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
