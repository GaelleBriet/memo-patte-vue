// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { treatmentView } from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { viewInputOf } from './dose-calendar.legacy-input.aides'
import {
  aRenseigner,
  affiche,
  carnet,
  cle,
  donne,
  echeance,
  H,
  jours,
  ligne,
  mois,
  modifie,
  oublie,
  supprime,
  vue,
  type Carnet,
} from './dose-calendar.recette.aides'

// #810, R10, décisions de Gaelle du 14 octobre 2026 : un réglage remplacé le jour même sans prise ne
// compte pas ; fréquence changée par rapport à avant ce jour, les échéances sans prise d'avant
// restent à renseigner.

const QUATRE = ['06:00', '12:00', '18:00', '23:00']

function lu(c: Carnet, today: string) {
  const view = vue(c, today)
  return {
    phase: view.phase,
    moment: view.currentDoses.map(cle),
    aRenseigner: aRenseigner(c, today),
  }
}

function luParLaReference(c: Carnet, today: string) {
  const { phase, current, unlogged } = referenceReading({
    ...viewInputOf({ ...c, today }),
    until: '2026-12-31',
  })
  return { phase, moment: current.slice(0, 1), aRenseigner: unlogged }
}

describe('#810, TR-28 : Milo tous les 3 jours à 8 h depuis le 3 oct., dose du 6 non donnée ; le 7, tous les 2 jours dès le 8', () => {
  function milo() {
    let c = carnet('2026-10-03', jours(3), ['08:00'])
    c = donne(c, '2026-10-03', echeance(c, '2026-10-03', '08:00'))
    return modifie(c, '2026-10-07', jours(2), ['08:00'], '2026-10-08')
  }
  const attendu = {
    phase: 'upcoming',
    moment: ['2026-10-08 08:00'],
    aRenseigner: ['2026-10-06 08:00'],
  }

  it('un seul « Modifier » : la dose du 6 est à renseigner', () => {
    expect(lu(milo(), '2026-10-07')).toEqual(attendu)
  })

  it('un second « Modifier » identique le même jour : même lecture', () => {
    const c = modifie(milo(), '2026-10-07', jours(2), ['08:00'], '2026-10-08')
    expect(lu(c, '2026-10-07')).toEqual(attendu)
  })

  it('dose du 8 donnée d’avance, second « Modifier » identique, puis la prise du 8 supprimée : la dose du 6 reste à renseigner', () => {
    let c = milo()
    c = donne(c, '2026-10-07', echeance(c, '2026-10-08', '08:00'), '2026-10-07', false)
    c = modifie(c, '2026-10-07', jours(2), ['08:00'], '2026-10-08')
    c = supprime(c, ligne(c, '2026-10-08', '08:00', 'given').id)
    expect(c.periods).toHaveLength(3)
    expect(lu(c, '2026-10-07')).toEqual(attendu)
    expect(luParLaReference(c, '2026-10-07')).toEqual(attendu)
  })
})

describe('R10, décision de Gaelle du 14 octobre 2026 : Milo tous les 3 jours à 8 h depuis le 3 oct., dose du 6 non donnée ; le 7, aller-retour de fréquence, comparé au réglage d’avant le 7', () => {
  function milo() {
    const c = carnet('2026-10-03', jours(3), ['08:00'])
    return donne(c, '2026-10-03', echeance(c, '2026-10-03', '08:00'))
  }
  const enRetard = { phase: 'overdue', moment: ['2026-10-06 08:00'], aRenseigner: [] }

  it('un téléphone : tous les 2 jours, puis retour à tous les 3 jours : la dose du 6 reste en retard', () => {
    const c = modifie(modifie(milo(), '2026-10-07', jours(2), ['08:00']), '2026-10-07', jours(3), [
      '08:00',
    ])
    expect(lu(c, '2026-10-07')).toEqual(enRetard)
    expect(luParLaReference(c, '2026-10-07')).toEqual(enRetard)
  })

  it('deux téléphones : A passe à tous les 2 jours, B garde tous les 3 jours à 9 h ; après la synchro, la dose du 6 est en retard, dans quelque ordre que les réglages arrivent', () => {
    const ecrit = (c: Carnet) => viewInputOf({ ...c, today: '2026-10-07' })
    const a = ecrit(modifie(milo(), '2026-10-07', jours(2), ['08:00']))
    const b = ecrit(modifie(milo(), '2026-10-07', jours(3), ['09:00']))
    const recu = { ...b.settings.at(-1)!, id: 'p3' }
    const synchronise = { ...a, settings: [...a.settings, recu] }
    const autreOrdre = { ...a, settings: [recu, ...a.settings].reverse() }
    for (const input of [synchronise, autreOrdre]) {
      const view = treatmentView(input)
      expect({
        phase: view.phase,
        moment: view.currentDoses.map(cle),
        aRenseigner: view.unloggedDoses.map(cle),
      }).toEqual(enRetard)
      const reference = referenceReading({ ...input, until: '2026-12-31' })
      expect([reference.phase, reference.current, reference.unlogged]).toEqual([
        'overdue',
        ['2026-10-06 08:00'],
        [],
      ])
    }
  })

  it('tous les 2 jours, dose du 7 donnée, retour à tous les 3 jours à 9 h dès le 9, puis la prise du 7 supprimée : comme un seul « Modifier », le 9 remplace la dose du 6', () => {
    let c = modifie(milo(), '2026-10-07', jours(2), ['08:00'])
    c = donne(c, '2026-10-07', echeance(c, '2026-10-07', '08:00'))
    c = modifie(c, '2026-10-07', jours(3), ['09:00'], '2026-10-09')
    c = supprime(c, ligne(c, '2026-10-07', '08:00', 'given').id)
    const seul = modifie(milo(), '2026-10-07', jours(3), ['09:00'], '2026-10-09')
    const attendu = { phase: 'upcoming', moment: ['2026-10-09 09:00'], aRenseigner: [] }
    expect(c.periods).toHaveLength(3)
    expect(lu(seul, '2026-10-07')).toEqual(attendu)
    expect(lu(c, '2026-10-07')).toEqual(attendu)
    expect(luParLaReference(c, '2026-10-07')).toEqual(attendu)
  })
})

describe('#810, forme A (graine 1500290961) : tous les 3 mois à 6, 12, 18 et 23 h depuis le 31 mars, dose de 18 h du 31 oubliée', () => {
  it('le 1er avr., tous les 2 jours dès le 2, 6 h du 2 donnée d’avance, second « Modifier » identique, prise supprimée : 6, 12 et 23 h du 31 à renseigner, prochaine dose le 2 à 6 h', () => {
    let c = carnet('2026-03-31', mois(3), QUATRE)
    c = oublie(c, '2026-04-01', echeance(c, '2026-03-31', '18:00'))
    c = modifie(c, '2026-04-01', jours(2), QUATRE)
    c = donne(c, '2026-04-01', echeance(c, '2026-04-02', '06:00'), '2026-04-01', false)
    c = modifie(c, '2026-04-01', jours(2), QUATRE)
    c = supprime(c, ligne(c, '2026-04-02', '06:00', 'given').id)
    const attendu = {
      phase: 'upcoming',
      moment: ['2026-04-02 06:00'],
      aRenseigner: ['2026-03-31 06:00', '2026-03-31 12:00', '2026-03-31 23:00'],
    }
    expect(lu(c, '2026-04-01')).toEqual(attendu)
    expect(luParLaReference(c, '2026-04-01')).toEqual(attendu)
  })
})

describe('#810, forme B (graine 1500061791) : tous les jours à 8 h et 20 h depuis le 10 avr., doses des 10 au 14 données, 15 non donnée', () => {
  it('le 16, toutes les 6 semaines à 20 h (dose du 16 donnée), retour à tous les jours à 20 h dès le 17, prise du 16 supprimée : le 15 à renseigner, prochaine dose le 17', () => {
    let c = carnet('2026-04-10', jours(1), H)
    for (const day of ['2026-04-10', '2026-04-11', '2026-04-12', '2026-04-13', '2026-04-14']) {
      for (const hour of H) c = donne(c, day, echeance(c, day, hour))
    }
    c = modifie(c, '2026-04-16', { value: 6, unit: 'week' }, ['20:00'])
    c = donne(c, '2026-04-16', echeance(c, '2026-04-16', '20:00'))
    c = modifie(c, '2026-04-16', jours(1), ['20:00'])
    expect(affiche(c, '2026-04-16', 1)).toEqual(['2026-04-17 20:00'])
    c = supprime(c, ligne(c, '2026-04-16', '20:00', 'given').id)
    const attendu = {
      phase: 'upcoming',
      moment: ['2026-04-17 20:00'],
      aRenseigner: ['2026-04-15 08:00', '2026-04-15 20:00'],
    }
    expect(lu(c, '2026-04-16')).toEqual(attendu)
    expect(luParLaReference(c, '2026-04-16')).toEqual(attendu)
  })
})

type Graine = Carnet & { today: string }

const GRAINES = JSON.parse(
  readFileSync(new URL('./fixtures/dose-calendar-graines.json', import.meta.url), 'utf8'),
) as Record<string, Graine>

describe('#810 : les graines de la campagne, après la suppression de la seule prise du réglage remplacé', () => {
  it.each<[number, string, string[]]>([
    [991003624, '2026-03-23 06:00', ['2026-03-14 06:00', '2026-03-20 12:00']],
    [1500018007, '2026-05-17 06:00', ['2026-03-27 08:00', '2026-03-27 20:00']],
    [
      1500061791,
      '2026-04-17 20:00',
      ['2026-04-10', '2026-04-11', '2026-04-12', '2026-04-13', '2026-04-14', '2026-04-15'].flatMap(
        (day) => H.map((hour) => `${day} ${hour}`),
      ),
    ],
    [1500080102, '2026-04-21 08:00', ['2026-03-10 14:00']],
    [1500196692, '2026-06-22 08:00', ['2026-03-22 06:00', '2026-03-22 12:00', '2026-03-22 23:00']],
    [1500233661, '2026-05-11 08:00', ['2026-03-30']],
    [1500234082, '2026-05-15 08:00', ['2026-04-03']],
    [1500236809, '2026-04-08 08:00', QUATRE.map((hour) => `2026-04-06 ${hour}`)],
    [1500256618, '2026-06-10 08:00', ['2026-03-10 14:00', '2026-03-10 20:00']],
    [1500290961, '2026-04-02 06:00', ['2026-03-31 06:00', '2026-03-31 12:00', '2026-03-31 23:00']],
  ])('graine %i : à venir le %s, doses en retard à renseigner', (seed, moment, unlogged) => {
    const { today, ...c } = GRAINES[String(seed)]!
    const attendu = { phase: 'upcoming', moment: [moment], aRenseigner: unlogged }
    expect(lu(c, today)).toEqual(attendu)
    expect(luParLaReference(c, today)).toEqual(attendu)
  })
})
