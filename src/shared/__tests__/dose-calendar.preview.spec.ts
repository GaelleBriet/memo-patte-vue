// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { applied, play, preview, treatmentView } from '../domain/dose-calendar'
import { keys, line, setting, WEEK } from './dose-calendar.v2.aides'

// Vendredis d'octobre : 2, 9, 16, 23, 30.
const p1 = setting('p1', '2026-10-02', WEEK)

describe('préversion (R12)', () => {
  const input = { settings: [p1], lines: [line('p1', 'given', '2026-10-09')], today: '2026-10-19' }
  const gesture = {
    kind: 'note' as const,
    due: { settingId: 'p1', dueOn: '2026-10-16', dueTime: null },
    status: 'given' as const,
    givenOn: '2026-10-19',
    shiftsFollowing: true,
  }

  it('la lecture après le geste, sur le carnet simulé : ce que l’écran montrera une fois écrit', () => {
    const shown = preview(input, gesture)
    if ('refusal' in shown) throw new Error(shown.refusal.reason)
    expect(keys(shown.upcoming({ limit: 2 }))).toEqual(['2026-10-26', '2026-11-02'])
    const result = play(input, gesture)
    if ('refusal' in result) throw new Error(result.refusal.reason)
    expect(keys(treatmentView(applied(input, result.changes)).upcoming({ limit: 2 }))).toEqual(
      keys(shown.upcoming({ limit: 2 })),
    )
  })

  it('un geste refusé n’a pas de préversion, et rien n’est écrit', () => {
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const refused = {
      settings: [p1],
      lines: [shift, line('p1', 'given', '2026-10-26')],
      today: '2026-10-27',
    }
    expect(preview(refused, { kind: 'remove', lineId: shift.id })).toEqual({
      refusal: { reason: 'later-dose' },
    })
    expect(refused.lines).toHaveLength(2)
  })
})
