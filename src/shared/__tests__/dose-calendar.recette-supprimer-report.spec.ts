// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  bornes,
  carnet,
  deplace,
  donne,
  echeance,
  jours,
  journees,
  ligne,
  modifie,
  mois,
  semaines,
  supprimeDecalage,
  supprimeReport,
  type Carnet,
} from './dose-calendar.recette.aides'

function vendredis(): Carnet {
  let c = carnet('2026-10-02', semaines(1))
  c = donne(c, '2026-10-02', echeance(c, '2026-10-02'))
  return donne(c, '2026-10-09', echeance(c, '2026-10-09'))
}

const statuses = (c: Carnet) => c.doses.map(({ status }) => status)

describe('#835, TR-24 : « Supprimer ce report » emporte le décalage ancré à son arrivée (décision du 2026-10-14)', () => {
  it('Milo, chaque vendredi depuis le 2 oct. ; le 12, dose du 16 avancée au 13 avec la case : 13, 20, 27 ; report supprimé : 16, 23, 30', () => {
    let c = deplace(vendredis(), '2026-10-12', echeance(vendredis(), '2026-10-16'), '2026-10-13')
    expect(journees(c, '2026-10-12', 3)).toEqual(['2026-10-13', '2026-10-20', '2026-10-27'])
    c = supprimeReport(c, '2026-10-12', ligne(c, '2026-10-16', null, 'postponed').id)
    expect(journees(c, '2026-10-12', 3)).toEqual(['2026-10-16', '2026-10-23', '2026-10-30'])
    expect(statuses(c)).toEqual(['given', 'given'])
  })

  it('dose du 16 reportée au 19 avec la case : 19, 26 ; report supprimé : 16, 23, 30', () => {
    let c = deplace(vendredis(), '2026-10-12', echeance(vendredis(), '2026-10-16'), '2026-10-19')
    expect(journees(c, '2026-10-12', 2)).toEqual(['2026-10-19', '2026-10-26'])
    c = supprimeReport(c, '2026-10-12', ligne(c, '2026-10-16', null, 'postponed').id)
    expect(journees(c, '2026-10-12', 3)).toEqual(['2026-10-16', '2026-10-23', '2026-10-30'])
    expect(statuses(c)).toEqual(['given', 'given'])
  })

  it('« Supprimer ce décalage » seul garde le report : chaque ligne se supprime seule', () => {
    let c = deplace(vendredis(), '2026-10-12', echeance(vendredis(), '2026-10-16'), '2026-10-19')
    c = supprimeDecalage(c, '2026-10-12', ligne(c, '2026-10-16', null, 'shift').id)
    expect(statuses(c)).toEqual(['given', 'given', 'postponed'])
  })

  it('un report sans la case : seul le report part, comme avant', () => {
    let c = deplace(
      vendredis(),
      '2026-10-12',
      echeance(vendredis(), '2026-10-16'),
      '2026-10-19',
      false,
    )
    c = supprimeReport(c, '2026-10-12', ligne(c, '2026-10-16', null, 'postponed').id)
    expect(journees(c, '2026-10-12', 3)).toEqual(['2026-10-16', '2026-10-23', '2026-10-30'])
  })

  it('16 reporté au 19 avec la case, puis 26 reporté seul au 28 : « Supprimer ce report » du 16 est refusé, comme « Prochaine dose » ramenée au 16 (later-line)', () => {
    let c = deplace(vendredis(), '2026-10-12', echeance(vendredis(), '2026-10-16'), '2026-10-19')
    c = deplace(c, '2026-10-12', echeance(c, '2026-10-26'), '2026-10-28', false)
    expect(bornes(c, '2026-10-12', echeance(c, '2026-10-19'))).toEqual({
      refusal: { reason: 'later-line' },
    })
    const report = ligne(c, '2026-10-16', null, 'postponed').id
    expect(() => supprimeReport(c, '2026-10-12', report)).toThrow('"later-line"')
    expect(journees(c, '2026-10-12', 3)).toEqual(['2026-10-19', '2026-10-28', '2026-11-02'])
  })

  it('le 12, dose du 16 avancée au 13 avec la case ; le 13 non renseigné, le 20 donné ; le 21, « Supprimer ce report » est refusé, comme « Prochaine dose » ramenée au 16 (later-dose)', () => {
    let c = deplace(vendredis(), '2026-10-12', echeance(vendredis(), '2026-10-16'), '2026-10-13')
    c = donne(c, '2026-10-20', echeance(c, '2026-10-20'), '2026-10-20', false)
    expect(bornes(c, '2026-10-21', echeance(c, '2026-10-13'))).toEqual({
      refusal: { reason: 'later-dose' },
    })
    const report = ligne(c, '2026-10-16', null, 'postponed').id
    expect(() => supprimeReport(c, '2026-10-21', report)).toThrow('"later-dose"')
  })

  it('graine 3210000768 : tous les jours à 20 h, le 16 mars mensuel dès le 16 avr., 16 avr. avancé au 20 mars avec la case, mensuel identique, report supprimé : 16 avr., 16 mai', () => {
    let c = carnet('2026-03-14', jours(1), ['20:00'])
    for (const day of ['2026-03-14', '2026-03-15', '2026-03-16']) {
      c = donne(c, day, echeance(c, day, '20:00'), day, false)
    }
    c = modifie(c, '2026-03-16', mois(1), ['20:00'], '2026-04-16')
    c = deplace(c, '2026-03-16', echeance(c, '2026-04-16', '20:00'), '2026-03-20')
    expect(journees(c, '2026-03-16', 3)).toEqual(['2026-03-20', '2026-04-20', '2026-05-20'])
    c = modifie(c, '2026-03-16', mois(1), ['20:00'])
    c = supprimeReport(c, '2026-03-16', ligne(c, '2026-04-16', '20:00', 'postponed').id)
    expect(journees(c, '2026-03-16', 3)).toEqual(['2026-04-16', '2026-05-16', '2026-06-16'])
  })
})
