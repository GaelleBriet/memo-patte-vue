import { describe, expect, it } from 'vitest'

import { renderCarnetPdf } from '../logic/render-carnet-pdf'
import { readPdf } from './pdf-reader'
import type { CarnetPdfContent } from '../logic/pdf-content'

const EMPTY_CONTENT: CarnetPdfContent = {
  animal: { name: 'Milo', species: 'dog', breed: null, birthDate: null, photoFileName: null },
  generatedOn: '2026-09-15',
  vaccinations: [],
  treatments: [],
  weightEntries: [],
}

const FULL_CONTENT: CarnetPdfContent = {
  animal: {
    name: 'Luna',
    species: 'cat',
    breed: 'Européen',
    birthDate: '2019-03-02',
    photoFileName: 'luna.jpg',
  },
  generatedOn: '2026-09-15',
  vaccinations: [
    { name: 'Rage', lastInjectionDate: '2025-01-01', dueDate: '2026-01-01', state: 'overdue' },
  ],
  treatments: [
    { name: 'Milbémax', lastDoseDate: '2026-06-01', nextDueDate: '2026-09-01', state: 'upToDate' },
  ],
  weightEntries: [
    { measuredOn: '2026-01-01', weightKg: 4 },
    { measuredOn: '2026-06-01', weightKg: 4.3 },
  ],
}

const PESEES_IRREGULIERES = [
  { measuredOn: '2025-09-20', weightKg: 4.2 },
  { measuredOn: '2025-10-18', weightKg: 4.3 },
  { measuredOn: '2025-12-20', weightKg: 4.6 },
  { measuredOn: '2026-01-10', weightKg: 4.5 },
  { measuredOn: '2026-06-27', weightKg: 4.1 },
  { measuredOn: '2026-09-19', weightKg: 4.3 },
]

function jours(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000
}

const TINY_JPEG_DATA_URL =
  'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAj/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCdABmX/9k='

describe('renderCarnetPdf', () => {
  it('rend un document non vide, sans rappel ni pesée', () => {
    const bytes = renderCarnetPdf(EMPTY_CONTENT, '0.1.24', null)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('rend un document avec rappels, traitement, tableau et courbe de poids ensemble', () => {
    const bytes = renderCarnetPdf(FULL_CONTENT, '0.1.24', null)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('dessine la photo quand elle est fournie', () => {
    const withoutPhoto = renderCarnetPdf(FULL_CONTENT, '0.1.24', null)
    const withPhoto = renderCarnetPdf(FULL_CONTENT, '0.1.24', TINY_JPEG_DATA_URL)
    expect(withPhoto.length).toBeGreaterThan(withoutPhoto.length)
  })

  it("n'échoue pas si la photo est illisible", () => {
    expect(() =>
      renderCarnetPdf(FULL_CONTENT, '0.1.24', 'data:image/jpeg;base64,invalide'),
    ).not.toThrow()
  })
})

describe('renderCarnetPdf — courbe de poids', () => {
  it('le PDF d’un animal à plusieurs pesées contient la courbe sur l’axe du temps', () => {
    const content = { ...FULL_CONTENT, weightEntries: PESEES_IRREGULIERES }
    const { texts, paths } = readPdf(renderCarnetPdf(content, '0.1.24', null))
    const courbe = paths.find(
      (path) => path.paint === 'S' && path.points.length === PESEES_IRREGULIERES.length,
    )!
    const debut = PESEES_IRREGULIERES[0]!.measuredOn
    const duree = jours(debut, PESEES_IRREGULIERES.at(-1)!.measuredOn)
    const largeur = courbe.points.at(-1)!.x - courbe.points[0]!.x
    const ecrits = texts.map((text) => text.text)

    PESEES_IRREGULIERES.forEach((entry, index) => {
      const attendu = (jours(debut, entry.measuredOn) / duree) * largeur
      expect(courbe.points[index]!.x - courbe.points[0]!.x).toBeCloseTo(attendu, 1)
    })
    expect(ecrits).toEqual(
      expect.arrayContaining(['Oct.', 'Déc.', 'Févr.', 'Avr.', 'Juin', 'Août']),
    )
    expect(ecrits).toEqual(expect.arrayContaining(['max 4,6', 'min 4,1', '4,3\u00a0kg']))
    expect(ecrits).not.toContain('4,5')
  })

  it('garde le tableau des pesées, sans courbe sous deux pesées', () => {
    const content = {
      ...FULL_CONTENT,
      weightEntries: [{ measuredOn: '2026-06-01', weightKg: 4.3 }],
    }
    const { texts, paths } = readPdf(renderCarnetPdf(content, '0.1.24', null))

    expect(paths).toEqual([])
    expect(texts.map((text) => text.text)).toEqual(expect.arrayContaining(['01/06/2026', '4,3 kg']))
  })

  it('n’écrit aucun texte sous 9 pt, tableau des pesées compris', () => {
    const content = { ...FULL_CONTENT, weightEntries: PESEES_IRREGULIERES }
    const { texts } = readPdf(renderCarnetPdf(content, '0.1.24', null))

    for (const text of texts) expect(text.sizePt).toBeGreaterThanOrEqual(9)
  })
})
