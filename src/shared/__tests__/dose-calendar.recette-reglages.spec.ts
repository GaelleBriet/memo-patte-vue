// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  aRenseigner,
  affiche,
  arrete,
  carnet,
  donne,
  echeance,
  H,
  jours,
  journees,
  modifie,
  mois,
  proposition,
  reprend,
  semaines,
} from './dose-calendar.recette.aides'

// Jeu de recette du moteur v2 (épic #758) : attentes des règles R1 à R12 et des décisions du
// 2026-10-10 ; un cas que le moteur en essai ne tient pas encore est marqué `it.fails` avec son
// ticket ou sa décision.

describe('R2, R3, R9 : première échéance, mois, nouveau réglage', () => {
  it('TR-7 : un mensuel du 31 janv. tombe le 28 févr., puis le 31 mars et le 30 avr.', () => {
    const c = carnet('2026-01-31', mois(1))
    expect(journees(c, '2026-01-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('Q37 : mensuel du 31, 31 janv. et 28 févr. données, posologie changée le 1er mars : 31 mars', () => {
    let c = carnet('2026-01-31', mois(1))
    c = donne(c, '2026-01-31', echeance(c, '2026-01-31'))
    c = donne(c, '2026-02-28', echeance(c, '2026-02-28'))
    c = modifie(c, '2026-03-01', mois(1), [])
    expect(journees(c, '2026-03-01', 3)).toEqual(['2026-03-31', '2026-04-30', '2026-05-31'])
  })

  it('#736 : mensuel du 31 à 8 h, heures changées le 20 févr. : 28 févr., 31 mars, 30 avr.', () => {
    let c = carnet('2026-01-31', mois(1), ['08:00'])
    c = donne(c, '2026-01-31', echeance(c, '2026-01-31', '08:00'))
    c = modifie(c, '2026-02-20', mois(1), ['09:00'])
    expect(journees(c, '2026-02-20', 3)).toEqual(['2026-02-28', '2026-03-31', '2026-04-30'])
  })

  it('Q7 : hebdo, dernière prise le 8 sept., tous les 15 jours le 29 : le 29, le 15 et le 22 à renseigner', () => {
    let c = carnet('2026-09-01', semaines(1))
    c = donne(c, '2026-09-01', echeance(c, '2026-09-01'))
    c = donne(c, '2026-09-08', echeance(c, '2026-09-08'))
    expect(proposition(c, '2026-09-29', jours(15), [])).toBe('2026-09-29')
    c = modifie(c, '2026-09-29', jours(15), [])
    expect(aRenseigner(c, '2026-09-29')).toEqual(['2026-09-15', '2026-09-22'])
    expect(journees(c, '2026-09-29', 2)).toEqual(['2026-09-29', '2026-10-14'])
  })

  it('Q36 : quotidien, dose du 6 notée le 7 au matin, tous les 2 jours le 7 : première dose le 7', () => {
    let c = carnet('2026-10-01', jours(1))
    for (const day of ['01', '02', '03', '04', '05']) {
      c = donne(c, `2026-10-${day}`, echeance(c, `2026-10-${day}`))
    }
    c = donne(c, '2026-10-07', echeance(c, '2026-10-06'), '2026-10-06')
    expect(proposition(c, '2026-10-07', jours(2), [])).toBe('2026-10-07')
  })

  it('G16 : hebdo, dose du 8 sept. notée le 10, le 17 tous les 10 jours : le 18', () => {
    let c = carnet('2026-09-01', semaines(1))
    c = donne(c, '2026-09-01', echeance(c, '2026-09-01'))
    c = donne(c, '2026-09-17', echeance(c, '2026-09-08'), '2026-09-10')
    expect(proposition(c, '2026-09-17', jours(10), [])).toBe('2026-09-18')
  })
})

describe('R4 : même rythme, prises en avance (G22)', () => {
  function metacam(heure: string) {
    let c = carnet('2026-10-01', jours(2), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    return donne(c, '2026-10-02', echeance(c, '2026-10-03', heure))
  }

  it('8 h du 3 donnée le 2, posologie changée le 2 : 20 h le 3, puis le 5', () => {
    const c = modifie(metacam('08:00'), '2026-10-02', jours(2), H)
    expect(affiche(c, '2026-10-02', 3)).toEqual([
      '2026-10-03 20:00',
      '2026-10-05 08:00',
      '2026-10-05 20:00',
    ])
  })

  it('20 h du 3 donnée en avance : c’est 8 h qui reste le 3', () => {
    const c = modifie(metacam('20:00'), '2026-10-02', jours(2), H)
    expect(affiche(c, '2026-10-02', 3)).toEqual([
      '2026-10-03 08:00',
      '2026-10-05 08:00',
      '2026-10-05 20:00',
    ])
  })

  it('quotidien, le 2 : 8 h du 2 et 8 h du 3 données, posologie changée : 20 h du 2, puis 20 h du 3', () => {
    let c = carnet('2026-10-01', jours(1), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    c = donne(c, '2026-10-02', echeance(c, '2026-10-02', '08:00'))
    c = donne(c, '2026-10-02', echeance(c, '2026-10-03', '08:00'))
    c = modifie(c, '2026-10-02', jours(1), H)
    expect(affiche(c, '2026-10-02', 3)).toEqual([
      '2026-10-02 20:00',
      '2026-10-03 20:00',
      '2026-10-04 08:00',
    ])
  })

  it('journée passée entamée, posologie changée le 4 : le 5, et 20 h du 3 à renseigner', () => {
    let c = carnet('2026-10-01', jours(2), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    c = donne(c, '2026-10-03', echeance(c, '2026-10-03', '08:00'))
    c = modifie(c, '2026-10-04', jours(2), H)
    expect(journees(c, '2026-10-04', 2)).toEqual(['2026-10-05', '2026-10-07'])
    expect(aRenseigner(c, '2026-10-04')).toEqual(['2026-10-03 20:00'])
  })
})

describe('R4, R9 : rythme changé, journée à venir entamée en avance (G24)', () => {
  function metacam() {
    let c = carnet('2026-10-01', jours(2), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    return donne(c, '2026-10-02', echeance(c, '2026-10-03', '08:00'))
  }

  it('heures passées le 2 à 9 h et 21 h : il ne reste que 21 h le 3, puis le 5', () => {
    const c = modifie(metacam(), '2026-10-02', jours(2), ['09:00', '21:00'])
    expect(affiche(c, '2026-10-02', 3)).toEqual([
      '2026-10-03 21:00',
      '2026-10-05 09:00',
      '2026-10-05 21:00',
    ])
  })

  it('fréquence passée à tous les 3 jours : il reste 20 h le 3, puis le 6', () => {
    const c = modifie(metacam(), '2026-10-02', jours(3), H)
    expect(affiche(c, '2026-10-02', 3)).toEqual([
      '2026-10-03 20:00',
      '2026-10-06 08:00',
      '2026-10-06 20:00',
    ])
  })

  it('heure passée à 9 h seule : prochaine dose le 5', () => {
    const c = modifie(metacam(), '2026-10-02', jours(2), ['09:00'])
    expect(affiche(c, '2026-10-02', 2)).toEqual(['2026-10-05 09:00', '2026-10-07 09:00'])
  })

  it('tous les 3 jours à 9 h, dose du 4 donnée le 2 avec décalage, tous les 2 jours le 3 : le 4', () => {
    let c = carnet('2026-10-01', jours(3), ['09:00'])
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '09:00'))
    c = donne(c, '2026-10-02', echeance(c, '2026-10-04', '09:00'), '2026-10-02', true)
    c = modifie(c, '2026-10-03', jours(2), ['09:00'])
    expect(journees(c, '2026-10-03', 2)).toEqual(['2026-10-04', '2026-10-06'])
  })

  it('tous les 3 jours, les deux doses du 4 données le 2, 20 h avec décalage, tous les 2 jours le 3 : le 4', () => {
    let c = carnet('2026-10-01', jours(3), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    c = donne(c, '2026-10-02', echeance(c, '2026-10-04', '08:00'), '2026-10-02', false)
    c = donne(c, '2026-10-02', echeance(c, '2026-10-04', '20:00'), '2026-10-02', true)
    c = modifie(c, '2026-10-03', jours(2), H)
    expect(affiche(c, '2026-10-03', 2)).toEqual(['2026-10-04 08:00', '2026-10-04 20:00'])
  })
})

describe('R4 : réglage changé en cours de journée (Q24)', () => {
  function luna() {
    let c = carnet('2026-10-01', jours(1), H)
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
    c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
    return c
  }
  const lunaDonnee8h = () => donne(luna(), '2026-10-02', echeance(luna(), '2026-10-02', '08:00'))

  it('8 h notée, nouvelles heures 9 h et 21 h : il reste 21 h', () => {
    const c = modifie(lunaDonnee8h(), '2026-10-02', jours(1), ['09:00', '21:00'])
    expect(affiche(c, '2026-10-02', 3)).toEqual([
      '2026-10-02 21:00',
      '2026-10-03 09:00',
      '2026-10-03 21:00',
    ])
  })

  it('8 h notée, nouvelles heures 8 h, 14 h et 20 h : restent 14 h et 20 h', () => {
    const c = modifie(lunaDonnee8h(), '2026-10-02', jours(1), ['08:00', '14:00', '20:00'])
    expect(affiche(c, '2026-10-02', 2)).toEqual(['2026-10-02 14:00', '2026-10-02 20:00'])
  })

  it('8 h notée, nouvelle heure 9 h seule : rien ne reste aujourd’hui', () => {
    const c = modifie(lunaDonnee8h(), '2026-10-02', jours(1), ['09:00'])
    expect(affiche(c, '2026-10-02', 1)).toEqual(['2026-10-03 09:00'])
  })

  it('rien noté, nouvelles heures 9 h et 21 h : 9 h et 21 h aujourd’hui', () => {
    const c = modifie(luna(), '2026-10-02', jours(1), ['09:00', '21:00'])
    expect(affiche(c, '2026-10-02', 2)).toEqual(['2026-10-02 09:00', '2026-10-02 21:00'])
  })
})

describe('R8 : reprendre', () => {
  it.fails(
    'Q-G3 : dose du jour donnée, arrêt, reprise le soir même : rien à redonner aujourd’hui',
    () => {
      let c = carnet('2026-10-01', jours(1))
      c = donne(c, '2026-10-01', echeance(c, '2026-10-01'))
      c = donne(c, '2026-10-02', echeance(c, '2026-10-02'))
      c = arrete(c, '2026-10-02')
      c = reprend(c, '2026-10-02', '2026-10-02', jours(1))
      expect(affiche(c, '2026-10-02', 1)).toEqual(['2026-10-03'])
    },
  )
})
