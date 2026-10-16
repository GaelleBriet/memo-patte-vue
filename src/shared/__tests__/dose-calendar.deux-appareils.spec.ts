// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { legacyFactsOf, treatmentView } from '../domain/dose-calendar'
import type { Line, Setting } from '../domain/dose-calendar/types'
import {
  affiche,
  carnet,
  donne,
  echeance,
  deplace,
  H,
  jours,
  modifie,
  mois,
  oublie,
  semaines,
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

const lignesDu12 = (c: Carnet) =>
  c.doses.filter(({ dueOn, dueTime }) => dueOn === doseDu12.dueOn && dueTime === doseDu12.dueTime)

describe('R11 : la même dose notée sous le même réglage par deux appareils', () => {
  it.each(['A puis B', 'B puis A'])(
    'Milo, tous les jours à 8 h ; A note la dose du 12 oubliée le 12, B la note donnée le 13 (reçues %s) : une seule ligne lue, la plus récente, l’autre sans effet',
    (ordre) => {
      const c = miloA8h()
      const parA = oublie(c, '2026-10-12', echeance(c, '2026-10-12', '08:00'))
      const parB = donne(c, '2026-10-13', echeance(c, '2026-10-12', '08:00'), '2026-10-12', false)
      const fusionne =
        ordre === 'A puis B' ? recus(c.periods, parA, parB) : recus(c.periods, parB, parA)
      const [oubli, prise] = [lignesDu12(parA)[0]!, lignesDu12(parB)[0]!]
      expect(oubli.periodId).toBe(prise.periodId)
      expect(lignesDu12(fusionne)).toHaveLength(2)
      expect(vue(fusionne, '2026-10-13').dueState(doseDu12)).toBe('given')
      expect(effetDe(fusionne, '2026-10-13', prise).kind).not.toBe('idle')
      expect(effetDe(fusionne, '2026-10-13', oubli)).toEqual({ kind: 'idle', reason: 'superseded' })
    },
  )
})

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

  function avantLe10(): Carnet {
    let c = carnet('2026-10-08', jours(1), ['08:00', '20:00'])
    for (const on of ['2026-10-08', '2026-10-09']) {
      c = donne(c, on, echeance(c, on, '08:00'))
      c = donne(c, on, echeance(c, on, '20:00'))
    }
    return c
  }

  it('R4, décision du 16 octobre 2026 : 20 h donnée d’avance le 10 sous 8 h et 20 h, heures passées à 12 h et 20 h le 10 : la prise couvre 20 h, 12 h reste à donner', () => {
    let c = donne(avantLe10(), '2026-10-10', echeance(avantLe10(), '2026-10-10', '20:00'))
    c = modifie(c, '2026-10-10', jours(1), ['12:00', '20:00'])
    expect(affiche(c, '2026-10-10', 2)).toEqual(['2026-10-10 12:00', '2026-10-11 12:00'])
  })

  // A donne 20 h d'avance le 10 sous 8 h et 20 h ; B passe à 12 h et 20 h le 10 sans voir la prise,
  // puis donne 20 h.
  function deuxPrisesDe20h(): { c: Carnet; parA: Dose; parB: Dose } {
    const base = avantLe10()
    const surA = donne(base, '2026-10-10', echeance(base, '2026-10-10', '20:00'))
    const modifieParB = modifie(base, '2026-10-10', jours(1), ['12:00', '20:00'])
    const surB = donne(modifieParB, '2026-10-10', echeance(modifieParB, '2026-10-10', '20:00'))
    return {
      c: recus(surB.periods, surA, surB),
      parA: surA.doses.at(-1)!,
      parB: surB.doses.at(-1)!,
    }
  }

  it('TR-25 : deux téléphones, 20 h notée sous chaque réglage : même dose, la plus récente couvre 20 h, l’autre est sans effet, 12 h reste à donner le 10', () => {
    const { c, parA, parB } = deuxPrisesDe20h()
    expect(affiche(c, '2026-10-10', 2)).toEqual(['2026-10-10 12:00', '2026-10-11 12:00'])
    expect(effetDe(c, '2026-10-10', parB)).toEqual({ kind: 'covers', key: '2026-10-10 20:00' })
    expect(effetDe(c, '2026-10-10', parA)).toEqual({ kind: 'idle', reason: 'superseded' })
  })

  it('TR-25 : ce même jour, « Supprimer » la prise de 20 h de B emporte celle de A, même dose : 12 h et 20 h restent à donner', () => {
    const { c, parA, parB } = deuxPrisesDe20h()
    const reste = supprimeReport(c, '2026-10-10', parB.id)
    expect(reste.doses).not.toContain(parA)
    expect(affiche(reste, '2026-10-10', 2)).toEqual(['2026-10-10 12:00', '2026-10-10 20:00'])
  })

  it('R7, le jour d’arrivée d’un report : Milo, toutes les 2 semaines à 8 h et 20 h depuis le 1er oct. ; le 10, dose du 15 déplacée au 20 sans la case, 20 h du 20 donnée d’avance, puis tous les mois à 12 h et 20 h, prochaine dose le 15 nov. ; le 20 garde 8 h et 20 h, « C’est fait » sur 8 h : journée complète (décision du 15 octobre 2026)', () => {
    let c = carnet('2026-10-01', semaines(2), ['08:00', '20:00'])
    for (const hour of ['08:00', '20:00'])
      c = donne(c, '2026-10-01', echeance(c, '2026-10-01', hour))
    c = deplace(c, '2026-10-10', echeance(c, '2026-10-15', '08:00'), '2026-10-20', false)
    c = donne(c, '2026-10-10', echeance(c, '2026-10-20', '20:00'), '2026-10-10', false)
    const davance = c.doses.at(-1)!
    c = modifie(c, '2026-10-10', mois(1), ['12:00', '20:00'], '2026-11-15')
    const vingt = vue(c, '2026-10-20').slots('2026-10-20', '2026-10-20')
    expect(vingt.map(({ due, state }) => `${due.settingId} ${due.dueTime} ${state}`)).toEqual([
      `${c.periods[0]!.id} 08:00 pending`,
      `${c.periods[0]!.id} 20:00 given`,
    ])
    c = donne(c, '2026-10-20', {
      ...echeance(c, '2026-10-20', '08:00'),
      periodId: c.periods[0]!.id,
    })
    expect(effetDe(c, '2026-10-20', davance)).toEqual({ kind: 'covers', key: '2026-10-20 20:00' })
    expect(affiche(c, '2026-10-20', 1)).toEqual(['2026-11-15 12:00'])
  })
})

describe('R4, R7, #802 : le jour d’arrivée d’un report, chaque réglage que le calendrier peut lire au jour d’origine', () => {
  const semaine = semaines(1)
  const huitQuatorzeVingt = ['08:00', '14:00', '20:00']
  let tic = 0

  function reglage(id: string, startsOn: string, fields: Partial<Setting>): Setting {
    tic += 1
    return {
      id,
      startsOn,
      firstDueOn: startsOn,
      ...legacyFactsOf(fields.gridOriginOn ?? null),
      gridOriginOn: null,
      endsOn: null,
      stoppedOn: null,
      frequency: jours(1),
      times: H,
      createdAt: `2026-01-01T00:00:${String(tic).padStart(2, '0')}.000Z`,
      ...fields,
    }
  }

  function ligneDe(
    settingId: string,
    status: Line['status'],
    dueOn: string,
    targetOn: string | null = null,
  ) {
    tic += 1
    const dueTime = status === 'postponed' ? '08:00' : '20:00'
    const givenOn = status === 'given' ? dueOn : null
    const updatedAt = `2026-01-01T00:01:${String(tic).padStart(2, '0')}.000Z`
    return { id: `l${tic}`, settingId, status, dueOn, dueTime, givenOn, targetOn, updatedAt }
  }

  it('réglage qui cède sa place le jour d’origine : toutes les semaines à 8 h et 20 h dès le 10 mars, première dose le 12 ; le 12, A passe à 8 h, 14 h et 20 h, puis B à 8 h et 20 h, prochaine dose le 20 ; dose du 12 reportée au 27 ; le 27, 20 h notée sur A et sur B : une seule dose de 20 h, 8 h reste à donner (décision du 15 octobre 2026)', () => {
    const settings = [
      reglage('s1', '2026-03-10', {
        firstDueOn: '2026-03-12',
        gridOriginOn: '2026-03-12',
        frequency: semaine,
      }),
      reglage('s2', '2026-03-12', {
        firstDueOn: '2026-03-20',
        frequency: semaine,
        times: huitQuatorzeVingt,
      }),
      reglage('s3', '2026-03-12', {
        firstDueOn: '2026-03-20',
        gridOriginOn: '2026-03-20',
        frequency: semaine,
      }),
    ]
    const surA = ligneDe('s2', 'given', '2026-03-27')
    const lines = [
      ligneDe('s1', 'postponed', '2026-03-12', '2026-03-27'),
      surA,
      ligneDe('s3', 'given', '2026-03-27'),
    ]
    const view = treatmentView({ settings, lines, today: '2026-03-27' })
    expect(view.dueState({ dueOn: '2026-03-27', dueTime: '08:00' })).toBe('pending')
    expect(view.dueState({ dueOn: '2026-03-27', dueTime: '20:00' })).toBe('given')
    expect(view.history.find(({ line }) => line.id === surA.id)!.effect).toEqual({
      kind: 'idle',
      reason: 'superseded',
    })
  })

  it('réglage en vigueur le jour d’origine : tous les jours à 8 h et 20 h dès le 1er mars, 8 h, 14 h et 20 h dès le 10, 8 h et 20 h dès le 13 ; dose du 12 reportée au 15 ; le 15, 20 h notée sous les deux derniers réglages : une seule dose de 20 h, 8 h reste à donner (décision du 15 octobre 2026)', () => {
    const settings = [
      reglage('s1', '2026-03-01', { gridOriginOn: '2026-03-01' }),
      reglage('s2', '2026-03-10', { times: huitQuatorzeVingt }),
      reglage('s3', '2026-03-13', {}),
    ]
    const lines = [
      ligneDe('s1', 'postponed', '2026-03-12', '2026-03-15'),
      ligneDe('s2', 'given', '2026-03-15'),
      ligneDe('s3', 'given', '2026-03-15'),
    ]
    const view = treatmentView({ settings, lines, today: '2026-03-15' })
    expect(view.dueState({ dueOn: '2026-03-15', dueTime: '08:00' })).toBe('pending')
    expect(view.dueState({ dueOn: '2026-03-15', dueTime: '20:00' })).toBe('given')
  })
})
