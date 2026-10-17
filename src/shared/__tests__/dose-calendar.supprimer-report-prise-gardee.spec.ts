// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { removeLine, type Line } from '../domain/dose-calendar'
import {
  affiche,
  carnet,
  deplace,
  donne,
  echeance,
  H,
  ligne,
  modifie,
  semaines,
  supprimeReport,
  vue,
  type Carnet,
} from './dose-calendar.recette.aides'
import { keys, line, setting, view, WEEK } from './dose-calendar.v2.aides'

const effetDe = (c: Carnet, today: string, id: string) =>
  vue(c, today).history.find(({ line: each }) => each.id === id)!.effect

function lundis(): Carnet {
  let c = carnet('2026-03-02', semaines(1), H)
  for (const day of ['2026-03-02', '2026-03-09']) {
    for (const hour of H) c = donne(c, day, echeance(c, day, hour), day, false)
  }
  c = donne(c, '2026-03-09', echeance(c, '2026-03-16', '20:00'), '2026-03-09', false)
  return modifie(c, '2026-03-11', semaines(1), ['09:00'], '2026-03-23')
}

describe('#847, R4 : après « Supprimer ce report », la journée lit les heures de ses prises restantes (décision du 16 octobre 2026)', () => {
  it('Milo, chaque lundi à 8 h et 20 h ; le 9 mars, 20 h du 16 donnée d’avance ; le 11, 9 h et « Prochaine dose » le 23 ; le 14, le 23 avancé au 17 avec la case, que la prise couvre (R4) ; le 18, report supprimé : la prise du 16 reste en vigueur, puis le 23 à 9 h', () => {
    let c = lundis()
    const prise = ligne(c, '2026-03-16', '20:00', 'given').id
    c = deplace(c, '2026-03-14', echeance(c, '2026-03-23', '09:00'), '2026-03-17')
    expect(effetDe(c, '2026-03-18', prise)).toEqual({ kind: 'covers', key: '2026-03-17 09:00' })
    c = supprimeReport(c, '2026-03-18', ligne(c, '2026-03-23', '09:00', 'postponed').id)
    expect(effetDe(c, '2026-03-18', prise)).toEqual({ kind: 'covers', key: '2026-03-16 20:00' })
    expect(affiche(c, '2026-03-18', 3)).toEqual([
      '2026-03-23 09:00',
      '2026-03-30 09:00',
      '2026-04-06 09:00',
    ])
    expect(vue(c, '2026-03-18').unloggedDoses).toEqual([])
  })

  it('même carnet sans le report : la prise du 16 couvre sa dose, rien n’est à donner le 16', () => {
    const c = lundis()
    const prise = ligne(c, '2026-03-16', '20:00', 'given').id
    expect(effetDe(c, '2026-03-18', prise)).toEqual({ kind: 'covers', key: '2026-03-16 20:00' })
    expect(affiche(c, '2026-03-11', 2)).toEqual(['2026-03-23 09:00', '2026-03-30 09:00'])
    expect(vue(c, '2026-03-18').unloggedDoses).toEqual([])
  })

  it('graine 901836 de la relecture de #845 : 8 h du 16 oubliée, 20 h donnée ; report du 23 au 17 supprimé : les deux prises du 16 restent sur leurs heures', () => {
    const settings = [
      setting('s1', '2026-03-02', WEEK),
      setting('s101', '2026-03-09', WEEK, H, { startsOn: '2026-03-05', gridOriginOn: null }),
      setting('s105', '2026-03-23', WEEK, ['09:00'], { startsOn: '2026-03-09' }),
    ]
    const first = line('s1', 'given', '2026-03-02')
    const missed8 = line('s101', 'missed', '2026-03-16', '08:00')
    const given20 = line('s101', 'given', '2026-03-16', '20:00')
    const report = line('s105', 'postponed', '2026-03-23', '09:00', '2026-03-17')
    const shift = line('s105', 'shift', '2026-03-23', '09:00', '2026-03-17')
    const today = '2026-03-18'
    const lines = [first, missed8, given20, report, shift]
    expect(removeLine({ settings, lines, today }, report.id)).toMatchObject({
      changes: [
        { action: 'delete', id: report.id },
        { action: 'delete', id: shift.id },
      ],
    })
    const read = view(settings, [first, missed8, given20], today)
    const effect = ({ id }: Line) => read.history.find(({ line: each }) => each.id === id)!.effect
    expect(effect(given20)).toEqual({ kind: 'covers', key: '2026-03-16 20:00' })
    expect(effect(missed8)).toEqual({ kind: 'covers', key: '2026-03-16 08:00' })
    expect(keys(read.currentDoses)).toEqual(['2026-03-23 09:00'])
  })
})
