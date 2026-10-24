// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type Line } from '../domain/dose-calendar'
import { chosenArrivalKept, reportToRewrite } from '../domain/dose-calendar/gestures/moved-report'
import { line, setting, WEEK } from './dose-calendar.v2.aides'

// Jeudis de mars : 5, 12, 19, 26.
const p1 = setting('p1', '2026-03-05', WEEK, ['08:00', '14:00', '20:00'])
const report = line('p1', 'postponed', '2026-03-12', '08:00', '2026-03-14')
const shift = line('p1', 'shift', '2026-03-12', '08:00', '2026-03-14')
const episode = new Set(['p1'])
const nothingNoted = () => false

function rewritten(lines: Line[], dueTime: string, carried = false) {
  const input = { settings: [p1], lines, today: '2026-03-08' }
  const due = { settingId: 'p1', dueOn: '2026-03-14', dueTime }
  return reportToRewrite(input, treatmentView(input), episode, due, nothingNoted, carried)
}

describe('le report que reprend « Prochaine dose » sur son arrivée (R7, #989)', () => {
  it('la dose du report, redéplacée depuis son arrivée, réécrit sa ligne', () => {
    expect(rewritten([report, shift], '08:00')).toBe(report)
  })

  it('une heure suivante de l’arrivée d’un décalage part de cette journée : aucune ligne réécrite', () => {
    expect(rewritten([report, shift], '14:00')).toBeUndefined()
  })

  it('emmenée par « Modifier » (#796), l’heure suivante reprend le report de son arrivée', () => {
    expect(rewritten([report, shift], '14:00', true)).toBe(report)
  })

  it('sans décalage, l’heure suivante touchée sur l’arrivée réécrit le report (Q-a)', () => {
    expect(rewritten([report], '14:00')).toBe(report)
  })
})

describe('l’arrivée d’avant que garde un report tourné depuis une date choisie (G13, #1000)', () => {
  // Jeudis : 5 mars ; nouveau réglage, prochaine dose choisie le 6 avril ; report tourné du 6 avril au 12 mars.
  const p2 = setting('p2', '2026-04-06', WEEK, ['08:00', '14:00', '20:00'], {
    startsOn: '2026-03-08',
    firstDueChosen: true,
  })
  const turned = {
    ...line('p1', 'postponed', '2026-03-05', '08:00', '2026-03-12'),
    previousTargetOn: '2026-04-06',
    previousTargetTime: '08:00',
  }
  const turn = line('p1', 'shift', '2026-03-05', '08:00', '2026-03-12')

  it('redéplacé avec son décalage, il garde la date choisie comme arrivée d’avant', () => {
    expect(chosenArrivalKept([p1, p2], turned, turn, '2026-03-14')).toEqual({
      previousTargetOn: '2026-04-06',
      previousTargetTime: '08:00',
    })
  })

  it('ramené sur la date choisie, ou sans décalage qui arrive avec lui : rien de gardé', () => {
    expect(chosenArrivalKept([p1, p2], turned, turn, '2026-04-06')).toBeUndefined()
    expect(chosenArrivalKept([p1, p2], turned, undefined, '2026-03-14')).toBeUndefined()
  })

  it('une arrivée d’avant qui n’était pas une date choisie : rien de gardé', () => {
    const plain = { ...turned, previousTargetOn: '2026-03-19' }
    expect(chosenArrivalKept([p1, p2], plain, turn, '2026-03-14')).toBeUndefined()
  })

  // #1232, Q40 : la date choisie se juge contre l'instant du « Modifier », pas contre sa date de grille héritée.
  it('un report écrit avant le « Modifier » qui a choisi la date, après sa date de grille héritée : rien de gardé', () => {
    const chooser = {
      ...p2,
      createdAt: '2026-03-08T10:00:00.000Z',
      updatedAt: '2026-03-08T10:00:00.000Z',
      gridWrittenAt: '2026-01-01T00:00:00.000Z',
    }
    const before = { ...turned, decidedAt: '2026-03-08T09:00:00.000Z' }
    const after = { ...turned, decidedAt: '2026-03-08T11:00:00.000Z' }
    expect(chosenArrivalKept([p1, chooser], before, turn, '2026-03-14')).toBeUndefined()
    expect(chosenArrivalKept([p1, chooser], after, turn, '2026-03-14')).toEqual({
      previousTargetOn: '2026-04-06',
      previousTargetTime: '08:00',
    })
  })
})
