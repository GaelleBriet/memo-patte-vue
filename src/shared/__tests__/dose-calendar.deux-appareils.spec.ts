// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  affiche,
  carnet,
  donne,
  echeance,
  jours,
  modifie,
  oublie,
  supprimeReport,
  type Carnet,
  vue,
} from './dose-calendar.recette.aides'

// #802 : une ligne de la même échéance reçue d'un autre appareil, sous un autre réglage (R11, R4).

type Dose = Carnet['doses'][number]

function recus(periods: Carnet['periods'], ...appareils: Carnet[]): Carnet {
  const doses: Dose[] = []
  for (const { doses: lues } of appareils) {
    for (const dose of lues) if (!doses.includes(dose)) doses.push(dose)
  }
  return { periods, doses }
}

function miloA8h(): Carnet {
  let c = carnet('2026-10-01', jours(1), ['08:00'])
  for (let day = 1; day <= 9; day += 1) {
    const on = `2026-10-0${day}`
    c = donne(c, on, echeance(c, on, '08:00'))
  }
  return c
}

const doseDu12 = { dueOn: '2026-10-12', dueTime: '08:00' }

const effetDe = (c: Carnet, today: string, dose: Dose) =>
  vue(c, today).history.find(({ line }) => line.id === dose.id)!.effect

describe('R11, #802 : la même dose notée sous deux réglages par deux appareils', () => {
  it.each(['A puis B', 'B puis A'])(
    'Milo, tous les jours à 8 h ; le 10, posologie changée sur B ; A, pas synchronisé, note la dose du 12 oubliée le 12, B la note donnée le 13 (reçues %s) : la plus récente, donnée, est lue',
    (ordre) => {
      const c = miloA8h()
      const surB = modifie(c, '2026-10-10', jours(1), ['08:00'])
      const parA = oublie(c, '2026-10-12', echeance(c, '2026-10-12', '08:00'))
      const parB = donne(
        surB,
        '2026-10-13',
        echeance(surB, '2026-10-12', '08:00'),
        '2026-10-12',
        false,
      )
      const fusionne =
        ordre === 'A puis B' ? recus(surB.periods, parA, parB) : recus(surB.periods, parB, parA)
      const oubli = parA.doses.find(({ status }) => status === 'missed')!
      expect(vue(fusionne, '2026-10-13').dueState(doseDu12)).toBe('given')
      expect(effetDe(fusionne, '2026-10-13', oubli)).toEqual({ kind: 'idle', reason: 'superseded' })
    },
  )

  it('B note la dose du 12 donnée le 12 à 9 h, A la note oubliée le 12 à 21 h : l’oubli, plus récent, est lu', () => {
    const c = miloA8h()
    const surB = modifie(c, '2026-10-10', jours(1), ['08:00'])
    const parB = donne(surB, '2026-10-12', echeance(surB, '2026-10-12', '08:00'))
    const parA = oublie(c, '2026-10-12', echeance(c, '2026-10-12', '08:00'))
    const fusionne = recus(surB.periods, parB, parA)
    const prise = parB.doses.find(
      ({ dueOn, status }) => dueOn === '2026-10-12' && status === 'given',
    )!
    expect(vue(fusionne, '2026-10-13').dueState(doseDu12)).toBe('missed')
    expect(effetDe(fusionne, '2026-10-13', prise)).toEqual({ kind: 'idle', reason: 'superseded' })
  })

  it('« Supprimer » la prise en vigueur emporte l’oubli reçu de l’autre appareil : la dose du 12 n’est plus notée', () => {
    const c = miloA8h()
    const surB = modifie(c, '2026-10-10', jours(1), ['08:00'])
    const parA = oublie(c, '2026-10-12', echeance(c, '2026-10-12', '08:00'))
    const parB = donne(surB, '2026-10-13', echeance(surB, '2026-10-12', '08:00'), '2026-10-12')
    const fusionne = recus(surB.periods, parA, parB)
    const prise = parB.doses.find(
      ({ dueOn, status }) => dueOn === '2026-10-12' && status === 'given',
    )!
    const apres = supprimeReport(fusionne, '2026-10-13', prise.id)
    expect(apres.doses.some(({ dueOn }) => dueOn === '2026-10-12')).toBe(false)
  })

  function heuresChangeesLe10(): Carnet {
    let c = carnet('2026-10-08', jours(1), ['08:00', '20:00'])
    for (const on of ['2026-10-08', '2026-10-09']) {
      c = donne(c, on, echeance(c, on, '08:00'))
      c = donne(c, on, echeance(c, on, '20:00'))
    }
    c = donne(c, '2026-10-10', echeance(c, '2026-10-10', '20:00'))
    c = modifie(c, '2026-10-10', jours(1), ['12:00', '20:00'])
    return donne(c, '2026-10-10', echeance(c, '2026-10-10', '20:00'))
  }

  it('R4, le jour où les heures changent : 20 h donnée d’avance le 10 sous 8 h et 20 h, heures passées à 12 h et 20 h le 10, puis 20 h donnée : les deux prises comptent, rien à donner le 10', () => {
    const c = heuresChangeesLe10()
    expect(affiche(c, '2026-10-10', 2)).toEqual(['2026-10-11 12:00', '2026-10-11 20:00'])
    const vingtHeures = c.doses.filter(
      ({ dueOn, dueTime }) => dueOn === '2026-10-10' && dueTime === '20:00',
    )
    expect(vingtHeures.map((dose) => effetDe(c, '2026-10-10', dose).kind)).toEqual([
      'covers',
      'covers',
    ])
  })

  it('TR-25, R4 : ce même jour, « Supprimer » la prise de 20 h du nouveau réglage garde celle d’avant le changement, qui couvre 12 h', () => {
    const c = heuresChangeesLe10()
    const [avant, apres] = c.doses.filter(
      ({ dueOn, dueTime }) => dueOn === '2026-10-10' && dueTime === '20:00',
    )
    const reste = supprimeReport(c, '2026-10-10', apres!.id)
    expect(reste.doses).toContain(avant)
    expect(affiche(reste, '2026-10-10', 1)).toEqual(['2026-10-10 20:00'])
  })
})
