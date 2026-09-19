import { describe, expect, it } from 'vitest'

import { renderCarnetPdf } from '../logic/render-carnet-pdf'
import type { CarnetPdfContent } from '../logic/pdf-content'

const EMPTY_CONTENT: CarnetPdfContent = {
  animal: { name: 'Milo', species: 'dog', breed: null, birthDate: null, photoFileName: null },
  generatedOn: '2026-09-15',
  vaccinations: [],
  treatments: [],
  weightEntries: [],
  weightChart: null,
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
  weightChart: {
    width: 300,
    height: 120,
    polyline: '16,100 284,20',
    points: [
      { x: 16, y: 100, valueLabel: '4,0', monthLabel: 'Janv.' },
      { x: 284, y: 20, valueLabel: '4,3', monthLabel: 'Juin' },
    ],
  },
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
