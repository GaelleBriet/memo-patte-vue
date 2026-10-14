// @vitest-environment node
import { describe, expect, it } from 'vitest'

import * as reference from './dose-calendar.reference.aides'
import {
  affiche,
  aRenseigner,
  arrete,
  carnet,
  cle,
  donne,
  echeance,
  jours,
  ligne,
  oublie,
  reprend,
  vue,
} from './dose-calendar.recette.aides'
import { DAY, keys, line, setting, view } from './dose-calendar.v2.aides'

// R8, décisions de Gaelle du 14 octobre 2026 : seule une prise donnée le jour même de la reprise
// couvre les autres heures de sa première journée ; reprise aux mêmes heures, la note posée sur
// l'échéance, prise ou oubli, reste.

const DAY8 = '2026-10-08'

function milo() {
  let c = carnet('2026-10-01', jours(1), ['08:00'])
  for (const day of ['01', '02', '03', '04', '05', '06', '07']) {
    c = donne(c, `2026-10-${day}`, echeance(c, `2026-10-${day}`, '08:00'))
  }
  return c
}

describe('R8 : Milo, une dose par jour à 8 h ; le 8, arrêt puis reprise le soir à 20 h', () => {
  it('dose de 8 h donnée : rien à redonner le 8, prochaine dose le 9 à 20 h', () => {
    let c = milo()
    c = donne(c, DAY8, echeance(c, DAY8, '08:00'))
    c = arrete(c, DAY8)
    c = reprend(c, DAY8, DAY8, jours(1), ['20:00'])
    expect(affiche(c, DAY8, 1)).toEqual(['2026-10-09 20:00'])
  })

  it('dose de 8 h marquée oubliée : la dose de 20 h de la reprise reste à donner', () => {
    let c = milo()
    c = oublie(c, DAY8, echeance(c, DAY8, '08:00'))
    c = arrete(c, DAY8)
    c = reprend(c, DAY8, DAY8, jours(1), ['20:00'])
    const read = vue(c, DAY8)
    expect([read.phase, read.currentDoses.map(cle)]).toEqual(['today', ['2026-10-08 20:00']])
    expect(aRenseigner(c, DAY8)).toEqual([])
  })

  it('l’oubli reste compté dans sa période, sur la dose de 8 h', () => {
    let c = milo()
    c = oublie(c, DAY8, echeance(c, DAY8, '08:00'))
    c = arrete(c, DAY8)
    c = reprend(c, DAY8, DAY8, jours(1), ['20:00'])
    const missed = ligne(c, DAY8, '08:00', 'missed')
    const read = vue(c, DAY8)
    expect(read.history.find((each) => each.line.id === missed.id)!.effect).toEqual({
      kind: 'covers',
      key: '2026-10-08 08:00',
    })
  })
})

describe('R8 : Milo à 8, 14 et 20 h ; le 8, dose de 8 h oubliée, arrêt puis reprise le 8 aux mêmes heures', () => {
  const HEURES = ['08:00', '14:00', '20:00']

  function reprise() {
    let c = carnet('2026-10-07', jours(1), HEURES)
    for (const hour of HEURES) c = donne(c, '2026-10-07', echeance(c, '2026-10-07', hour))
    c = oublie(c, DAY8, echeance(c, DAY8, '08:00'))
    c = arrete(c, DAY8)
    return reprend(c, DAY8, DAY8, jours(1), HEURES)
  }

  it('la dose de 8 h n’est pas redemandée, celles de 14 et 20 h sont à donner', () => {
    const read = vue(reprise(), DAY8)
    expect([read.phase, read.currentDoses.map(cle)]).toEqual([
      'today',
      ['2026-10-08 14:00', '2026-10-08 20:00'],
    ])
    expect(aRenseigner(reprise(), DAY8)).toEqual([])
  })

  it('l’oubli reste sur la dose de 8 h, rien n’est sans effet', () => {
    const c = reprise()
    const missed = ligne(c, DAY8, '08:00', 'missed')
    expect(vue(c, DAY8).history.find((each) => each.line.id === missed.id)!.effect).toEqual({
      kind: 'covers',
      key: '2026-10-08 08:00',
    })
  })

  it('le modèle de référence lit la même chose', () => {
    const stopped = reference.setting('p1', '2026-10-07', reference.DAY, HEURES, {
      stoppedOn: DAY8,
    })
    const resumed = reference.setting('p2', DAY8, reference.DAY, HEURES)
    const lines = [reference.line('p1', 'missed', DAY8, '08:00')]
    expect(reference.next([stopped, resumed], lines, DAY8, 2)).toEqual([
      '2026-10-08 14:00',
      '2026-10-08 20:00',
    ])
  })
})

describe('R8, R11 : deux appareils, la ligne la plus récente du jour de la reprise décide', () => {
  const stopped = setting('p1', '2026-10-01', DAY, ['08:00'], { stoppedOn: DAY8 })
  const resumed = setting('p2', DAY8, DAY, ['20:00'])

  it('donnée sur un appareil, puis oubliée sur l’autre : la dose de 20 h reste à donner', () => {
    const lines = [line('p1', 'given', DAY8, '08:00'), line('p1', 'missed', DAY8, '08:00')]
    expect(keys(view([stopped, resumed], lines, DAY8).currentDoses)).toEqual(['2026-10-08 20:00'])
  })

  it('oubliée sur un appareil, puis donnée sur l’autre : la journée est couverte', () => {
    const lines = [line('p1', 'missed', DAY8, '08:00'), line('p1', 'given', DAY8, '08:00')]
    expect(keys(view([stopped, resumed], lines, DAY8).currentDoses)).toEqual(['2026-10-09 20:00'])
  })
})

describe('R8 : le modèle de référence', () => {
  const stopped = reference.setting('p1', '2026-10-01', reference.DAY, ['08:00'], {
    stoppedOn: DAY8,
  })
  const resumed = reference.setting('p2', DAY8, reference.DAY, ['20:00'])

  it('dose de 8 h oubliée, reprise le 8 à 20 h : la dose de 20 h reste à donner', () => {
    const lines = [reference.line('p1', 'missed', DAY8, '08:00')]
    expect(reference.next([stopped, resumed], lines, DAY8, 1)).toEqual(['2026-10-08 20:00'])
  })

  it('dose de 8 h donnée, puis oubliée sur un autre appareil : la dose de 20 h reste à donner', () => {
    const lines = [
      reference.line('p1', 'given', DAY8, '08:00'),
      reference.line('p1', 'missed', DAY8, '08:00'),
    ]
    expect(reference.next([stopped, resumed], lines, DAY8, 1)).toEqual(['2026-10-08 20:00'])
  })

  it('dose de 8 h donnée : rien à redonner le 8', () => {
    const lines = [reference.line('p1', 'given', DAY8, '08:00')]
    expect(reference.next([stopped, resumed], lines, DAY8, 1)).toEqual(['2026-10-09 20:00'])
  })
})
