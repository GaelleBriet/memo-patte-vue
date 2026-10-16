// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { DAY, H, line, read, setting, WEEK } from './dose-calendar.reference.aides'

const H3 = ['08:00', '14:00', '20:00']

describe('R4, R7, #802 : le jour d’arrivée d’un report, chaque réglage que le calendrier peut lire au jour d’origine', () => {
  it('réglage qui cède sa place le jour d’origine : deux réglages ouverts le 12, l’un à 8 h, 14 h et 20 h, l’autre à 8 h et 20 h ; dose du 12 reportée au 27, puis 20 h notée sous chacun : 8 h du 27 reste à donner, 20 h ne compte qu’une fois (décision du 15 octobre 2026)', () => {
    const p1 = setting('p1', '2026-03-12', WEEK, H, { startsOn: '2026-03-10' })
    const p2 = setting('p2', '2026-03-20', WEEK, H3, { startsOn: '2026-03-12', gridOriginOn: null })
    const p3 = setting('p3', '2026-03-20', WEEK, H, { startsOn: '2026-03-12' })
    const lines = [
      line('p1', 'postponed', '2026-03-12', '08:00', '2026-03-27'),
      line('p2', 'given', '2026-03-27', '20:00'),
      line('p3', 'given', '2026-03-27', '20:00'),
    ]
    const reading = read([p1, p2, p3], lines, '2026-03-27')
    expect(reading.current).toContain('2026-03-27 08:00')
    expect(reading.current).not.toContain('2026-03-27 20:00')
  })

  it('réglage en vigueur le jour d’origine : 8 h et 20 h dès le 1er mars, 8 h, 14 h et 20 h dès le 10, 8 h et 20 h dès le 13 ; dose du 12 reportée au 15, puis 20 h notée sous les deux derniers : 8 h du 15 reste à donner, 20 h ne compte qu’une fois (décision du 15 octobre 2026)', () => {
    const p1 = setting('p1', '2026-03-01', DAY, H)
    const p2 = setting('p2', '2026-03-10', DAY, H3, { gridOriginOn: null })
    const p3 = setting('p3', '2026-03-13', DAY, H, { gridOriginOn: null })
    const lines = [
      line('p1', 'postponed', '2026-03-12', '08:00', '2026-03-15'),
      line('p2', 'given', '2026-03-15', '20:00'),
      line('p3', 'given', '2026-03-15', '20:00'),
    ]
    const reading = read([p1, p2, p3], lines, '2026-03-15')
    expect(reading.current).toContain('2026-03-15 08:00')
    expect(reading.current).not.toContain('2026-03-15 20:00')
  })
})
