import { describe, expect, it } from 'vitest'

import { isTreatmentFinished, isTreatmentOpen } from '../domain/treatment-finished'

describe('isTreatmentOpen', () => {
  it.each([
    ['ended', false],
    ['stopped', false],
    ['overdue', true],
  ] as const)('phase %s', (phase, open) => {
    expect(isTreatmentOpen({ phase } as never)).toBe(open)
  })
})

describe('isTreatmentFinished', () => {
  it('un traitement fini sans dose à renseigner est terminé', () => {
    expect(isTreatmentFinished({ phase: 'ended', finished: true } as never, true)).toBe(true)
  })

  it('un traitement arrêté avec des doses à renseigner reste en cours pour un animal suivi', () => {
    expect(isTreatmentFinished({ phase: 'stopped', finished: false } as never, true)).toBe(false)
  })

  it('un traitement arrivé à sa date de fin avec des doses à renseigner reste en cours', () => {
    expect(isTreatmentFinished({ phase: 'ended', finished: false } as never, true)).toBe(false)
  })

  it('pour un animal qu’on ne suit plus, un traitement arrêté est terminé', () => {
    expect(isTreatmentFinished({ phase: 'stopped', finished: false } as never, false)).toBe(true)
  })

  it('un traitement ouvert n’est jamais terminé', () => {
    expect(isTreatmentFinished({ phase: 'overdue', finished: false } as never, false)).toBe(false)
  })
})
