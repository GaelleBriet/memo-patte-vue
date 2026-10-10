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
  ligne,
  modifie,
  mois,
  sansPrise,
  semaines,
  supprime,
  supprimeDecalage,
  supprimeReport,
} from './dose-calendar.recette.aides'

// Jeu de recette du moteur v2 (épic #758) : une heure reportée emporte les suivantes encore sans
// prise (R7) ; une prise couvre son échéance dans tout le calendrier (R4).

function base() {
  let c = carnet('2026-10-01', jours(2), H)
  c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
  c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
  return donne(c, '2026-10-03', echeance(c, '2026-10-03', '08:00'))
}

function reporte20h(decale = false, to = '2026-10-04') {
  const c = base()
  return deplace(c, '2026-10-03', echeance(c, '2026-10-03', '20:00'), to, decale)
}

const suite = ['2026-10-04 20:00', '2026-10-05 08:00', '2026-10-05 20:00']

describe('R7 : 8 h du 3 donnée, 20 h du 3 reportée au 4', () => {
  it('seule : le 4 ne reçoit que 20 h, puis le 5 à 8 h et 20 h', () => {
    expect(affiche(reporte20h(), '2026-10-04', 3)).toEqual(suite)
  })

  it('avec décalage : 20 h le 4, puis le 6 ; décalage supprimé : 20 h le 4, suite au 5', () => {
    let c = reporte20h(true)
    expect(affiche(c, '2026-10-04', 3)).toEqual([
      '2026-10-04 20:00',
      '2026-10-06 08:00',
      '2026-10-06 20:00',
    ])
    c = supprimeDecalage(c, '2026-10-04', ligne(c, '2026-10-03', '20:00', 'shift').id)
    expect(affiche(c, '2026-10-04', 3)).toEqual(suite)
  })

  it('posologie changée le 4 : 20 h le 4, puis le 5', () => {
    const c = modifie(reporte20h(), '2026-10-04', jours(2), H)
    expect(affiche(c, '2026-10-04', 3)).toEqual(suite)
  })

  for (const jour of ['2026-10-03', '2026-10-04']) {
    it(`heures passées à 9 h et 21 h le ${jour.slice(8)} : 21 h le 4, puis le 5 à 9 h et 21 h`, () => {
      const c = modifie(reporte20h(), jour, jours(2), ['09:00', '21:00'])
      expect(affiche(c, '2026-10-04', 3)).toEqual([
        '2026-10-04 21:00',
        '2026-10-05 09:00',
        '2026-10-05 21:00',
      ])
    })
  }

  it('la dose reportée déjà donnée le 3, heures changées le 4 : rien le 4, puis le 5', () => {
    let c = reporte20h()
    c = donne(c, '2026-10-03', echeance(c, '2026-10-04', '20:00'))
    c = modifie(c, '2026-10-04', jours(2), ['09:00', '21:00'])
    expect(affiche(c, '2026-10-04', 2)).toEqual(['2026-10-05 09:00', '2026-10-05 21:00'])
  })

  it('fréquence changée le 4 pour tous les 3 jours : 20 h le 4, puis le 7', () => {
    const c = modifie(reporte20h(), '2026-10-04', jours(3), H)
    expect(affiche(c, '2026-10-04', 3)).toEqual([
      '2026-10-04 20:00',
      '2026-10-07 08:00',
      '2026-10-07 20:00',
    ])
  })

  it('fréquence changée le 4 pour tous les jours : le 5 ; pour chaque semaine : le 11', () => {
    const c = reporte20h()
    expect(journees(modifie(c, '2026-10-04', jours(1), H), '2026-10-04', 2)).toEqual([
      '2026-10-04',
      '2026-10-05',
    ])
    expect(journees(modifie(c, '2026-10-04', semaines(1), H), '2026-10-04', 2)).toEqual([
      '2026-10-04',
      '2026-10-11',
    ])
  })

  it('fréquence changée le 3, jour d’origine : 20 h le 3, puis le 6', () => {
    const c = modifie(reporte20h(), '2026-10-03', jours(3), H)
    expect(affiche(c, '2026-10-03', 3)).toEqual([
      '2026-10-03 20:00',
      '2026-10-06 08:00',
      '2026-10-06 20:00',
    ])
  })

  it.fails(
    'R10, Q-#744 : plusieurs changements le 4, fréquence ramenée aussitôt : 20 h le 4, puis le 5',
    () => {
      let c = modifie(reporte20h(), '2026-10-04', jours(3), H)
      c = modifie(c, '2026-10-04', jours(2), H)
      expect(affiche(c, '2026-10-04', 3)).toEqual(suite)
    },
  )

  it('avec décalage, reportée au 5, jour de la grille : 20 h le 5, puis le 7', () => {
    expect(affiche(reporte20h(true, '2026-10-05'), '2026-10-04', 3)).toEqual([
      '2026-10-05 20:00',
      '2026-10-07 08:00',
      '2026-10-07 20:00',
    ])
  })

  it('la prise de 8 h du 3 supprimée : 8 h revient le 3', () => {
    let c = reporte20h()
    c = supprime(c, ligne(c, '2026-10-03', '08:00', 'given').id)
    expect(sansPrise(c, '2026-10-04')).toContain('2026-10-03 08:00')
  })

  it.fails(
    '#734 : posologie changée le 4, puis « Supprimer ce report » : 20 h du 3 à renseigner, rien le 4, puis le 5',
    () => {
      let c = modifie(reporte20h(), '2026-10-04', jours(2), H)
      c = supprimeReport(c, '2026-10-04', ligne(c, '2026-10-03', '20:00', 'postponed').id)
      expect(aRenseigner(c, '2026-10-04')).toEqual(['2026-10-03 20:00'])
      expect(affiche(c, '2026-10-04', 2)).toEqual(['2026-10-05 08:00', '2026-10-05 20:00'])
    },
  )
})

describe('R4, R10 : une prise couvre son échéance, un réglage du jour se remplace', () => {
  it.fails(
    '#741 : tous les 3 mois à 6, 12, 18, 23 h ; 23 h reportée au 12, donnée le 5 ; chaque semaine le 12 : rien le 12, le 19',
    () => {
      const T = ['06:00', '12:00', '18:00', '23:00']
      let c = carnet('2026-03-10', mois(3), T)
      for (const heure of T.slice(0, 3)) {
        c = donne(c, '2026-03-10', echeance(c, '2026-03-10', heure))
      }
      c = deplace(c, '2026-03-10', echeance(c, '2026-03-10', '23:00'), '2026-03-12', true)
      c = donne(c, '2026-03-12', echeance(c, '2026-03-12', '23:00'), '2026-03-05')
      expect(journees(c, '2026-03-12', 1)).toEqual(['2026-06-05'])
      c = modifie(c, '2026-03-12', semaines(1), H)
      expect(journees(c, '2026-03-12', 1)).toEqual(['2026-03-19'])
    },
  )

  it.fails(
    '#738 : 20 h du 3 donnée, posologie changée le 3, prise supprimée : 20 h du 3 revient',
    () => {
      let c = base()
      c = donne(c, '2026-10-03', echeance(c, '2026-10-03', '20:00'))
      c = modifie(c, '2026-10-03', jours(2), H)
      c = supprime(c, ligne(c, '2026-10-03', '20:00', 'given').id)
      expect(sansPrise(c, '2026-10-03')).toContain('2026-10-03 20:00')
    },
  )

  it.fails(
    '#744 : rien noté le 3, journée reportée seule au 4, fréquence → 3 jours puis → 2 jours le 3 : 4, 5, 7',
    () => {
      let c = carnet('2026-10-01', jours(2), H)
      c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '08:00'))
      c = donne(c, '2026-10-01', echeance(c, '2026-10-01', '20:00'))
      c = deplace(c, '2026-10-03', echeance(c, '2026-10-03', '08:00'), '2026-10-04', false)
      c = modifie(c, '2026-10-03', jours(3), H)
      c = modifie(c, '2026-10-03', jours(2), H)
      expect(journees(c, '2026-10-03', 3)).toEqual(['2026-10-04', '2026-10-05', '2026-10-07'])
    },
  )
})
