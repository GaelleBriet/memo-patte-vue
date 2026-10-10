// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  aRenseigner,
  affiche,
  carnet,
  deplace,
  donne,
  echeance,
  H,
  jours,
  journees,
  modifie,
  mois,
  semaines,
} from './dose-calendar.recette.aides'

// Jeu de recette du moteur v2 (épic #758) : un report, seul ou avec décalage, reste une ligne du
// traitement quand la posologie change (R3, R7, R11).

describe('R3, R7 : report seul et posologie changée', () => {
  function vermifuge2j() {
    const c = carnet('2026-10-01', jours(2))
    return donne(c, '2026-10-01', echeance(c, '2026-10-01'))
  }

  for (const jour of ['2026-10-02', '2026-10-03', '2026-10-04']) {
    it(`dose du 3 reportée seule au 4, posologie changée le ${jour.slice(8)} : 4, 5, 7`, () => {
      let c = vermifuge2j()
      c = deplace(c, '2026-10-02', echeance(c, '2026-10-03'), '2026-10-04', false)
      c = modifie(c, jour, jours(2), [])
      expect(journees(c, jour, 3)).toEqual(['2026-10-04', '2026-10-05', '2026-10-07'])
    })
  }

  it('dose du 5 avancée seule au 4 : 4, 7, 9', () => {
    let c = vermifuge2j()
    c = donne(c, '2026-10-03', echeance(c, '2026-10-03'))
    c = deplace(c, '2026-10-03', echeance(c, '2026-10-05'), '2026-10-04', false)
    c = modifie(c, '2026-10-03', jours(2), [])
    expect(journees(c, '2026-10-03', 3)).toEqual(['2026-10-04', '2026-10-07', '2026-10-09'])
  })

  it('dose du 5 avancée au 4 avec décalage : 4, 6, 8', () => {
    let c = vermifuge2j()
    c = donne(c, '2026-10-03', echeance(c, '2026-10-03'))
    c = deplace(c, '2026-10-03', echeance(c, '2026-10-05'), '2026-10-04', true)
    c = modifie(c, '2026-10-03', jours(2), [])
    expect(journees(c, '2026-10-03', 3)).toEqual(['2026-10-04', '2026-10-06', '2026-10-08'])
  })

  it('hebdo, dose du 8 avancée au 6 avec décalage : 6, 13, 20', () => {
    let c = carnet('2026-10-01', semaines(1))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01'))
    c = deplace(c, '2026-10-02', echeance(c, '2026-10-08'), '2026-10-06', true)
    c = modifie(c, '2026-10-02', semaines(1), [])
    expect(journees(c, '2026-10-02', 3)).toEqual(['2026-10-06', '2026-10-13', '2026-10-20'])
  })

  it('mensuel du 31, dose du 28 févr. avancée seule au 25 : 25 févr., 31 mars, 30 avr.', () => {
    let c = carnet('2026-01-31', mois(1))
    c = donne(c, '2026-01-31', echeance(c, '2026-01-31'))
    c = deplace(c, '2026-02-10', echeance(c, '2026-02-28'), '2026-02-25', false)
    c = modifie(c, '2026-02-10', mois(1), [])
    expect(journees(c, '2026-02-10', 3)).toEqual(['2026-02-25', '2026-03-31', '2026-04-30'])
  })

  it('8 h et 20 h, journée du 3 reportée seule au 4, 8 h du 4 donnée le 2 : 20 h du 4, puis le 5', () => {
    let c = carnet('2026-10-01', jours(2), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    c = deplace(c, '2026-10-02', echeance(c, '2026-10-03', '08:00'), '2026-10-04', false)
    c = donne(c, '2026-10-02', echeance(c, '2026-10-04', '08:00'))
    c = modifie(c, '2026-10-02', jours(2), H)
    expect(affiche(c, '2026-10-02', 3)).toEqual([
      '2026-10-04 20:00',
      '2026-10-05 08:00',
      '2026-10-05 20:00',
    ])
  })

  it('Q-§11 : hebdo, dose du 8 avancée seule au 6 et donnée, dose du 15 reportée seule au 17, posologie le 7 : 17, 22, 29', () => {
    let c = carnet('2026-10-01', semaines(1))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01'))
    c = deplace(c, '2026-10-02', echeance(c, '2026-10-08'), '2026-10-06', false)
    c = donne(c, '2026-10-06', echeance(c, '2026-10-06'))
    c = deplace(c, '2026-10-06', echeance(c, '2026-10-15'), '2026-10-17', false)
    c = modifie(c, '2026-10-07', semaines(1), [])
    expect(journees(c, '2026-10-07', 3)).toEqual(['2026-10-17', '2026-10-22', '2026-10-29'])
  })

  it('#719 : hebdo, dose du 8 donnée, dose du 15 reportée seule au 17, posologie changée le 9 : 17, 22, 29', () => {
    let c = carnet('2026-10-01', semaines(1))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01'))
    c = donne(c, '2026-10-08', echeance(c, '2026-10-08'))
    c = deplace(c, '2026-10-09', echeance(c, '2026-10-15'), '2026-10-17', false)
    c = modifie(c, '2026-10-09', semaines(1), [])
    expect(journees(c, '2026-10-09', 3)).toEqual(['2026-10-17', '2026-10-22', '2026-10-29'])
  })

  it('#737 : tous les 2 jours, rien noté le 3, journée reportée seule au 4, heures passées à 9 h et 21 h le 3 : 4, 5, 7', () => {
    let c = carnet('2026-10-01', jours(2), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    c = deplace(c, '2026-10-03', echeance(c, '2026-10-03', '08:00'), '2026-10-04', false)
    c = modifie(c, '2026-10-03', jours(2), ['09:00', '21:00'])
    expect(affiche(c, '2026-10-03', 4)).toEqual([
      '2026-10-04 09:00',
      '2026-10-04 21:00',
      '2026-10-05 09:00',
      '2026-10-05 21:00',
    ])
    expect(journees(c, '2026-10-03', 3)).toEqual(['2026-10-04', '2026-10-05', '2026-10-07'])
  })

  it('#745 : tous les 6 jours à 8, 14, 20 h, deux reports seuls sur deux réglages, 9 h seule le 5 : 7, 13', () => {
    let c = carnet('2026-10-01', jours(6), ['08:00', '14:00', '20:00'])
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = deplace(c, '2026-10-01', echeance(c, '2026-10-01', '14:00'), '2026-10-03', false)
    expect(affiche(c, '2026-10-01', 2)).toEqual(['2026-10-03 14:00', '2026-10-03 20:00'])
    c = modifie(c, '2026-10-02', jours(6), ['08:00', '14:00', '20:00'])
    c = donne(c, '2026-10-03', echeance(c, '2026-10-03', '14:00'))
    c = deplace(c, '2026-10-03', echeance(c, '2026-10-03', '20:00'), '2026-10-05', false)
    c = donne(c, '2026-10-05', echeance(c, '2026-10-05', '20:00'))
    c = modifie(c, '2026-10-05', jours(6), ['09:00'])
    expect(journees(c, '2026-10-05', 2)).toEqual(['2026-10-07', '2026-10-13'])
  })

  it('tous les 3 jours, journée du 4 reportée seule au 5, 8 h donnée le 5, posologie le 6 : le 7, 20 h du 5 à renseigner', () => {
    let c = carnet('2026-10-01', jours(3), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    c = deplace(c, '2026-10-02', echeance(c, '2026-10-04', '08:00'), '2026-10-05', false)
    c = donne(c, '2026-10-05', echeance(c, '2026-10-05', '08:00'))
    c = modifie(c, '2026-10-06', jours(3), H)
    expect(journees(c, '2026-10-06', 2)).toEqual(['2026-10-07', '2026-10-10'])
    expect(aRenseigner(c, '2026-10-06')).toEqual(['2026-10-05 20:00'])
  })
})

describe('R3, R6 : décalage et heures changées', () => {
  it.fails(
    '#743 : tous les 3 mois à 8 h et 20 h du 29 mars, les deux doses données le 28 avec décalage, heures passées à 8, 14, 20 h : 28 juin, 28 sept.',
    () => {
      let c = carnet('2026-03-29', mois(3), H)
      c = donne(c, '2026-03-28', echeance(c, '2026-03-29', '08:00'), '2026-03-28', true)
      c = donne(c, '2026-03-28', echeance(c, '2026-03-29', '20:00'), '2026-03-28', true)
      c = modifie(c, '2026-03-28', mois(3), ['08:00', '14:00', '20:00'])
      expect(journees(c, '2026-03-28', 2)).toEqual(['2026-06-28', '2026-09-28'])
    },
  )
})
