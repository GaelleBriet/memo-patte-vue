// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  noteDose,
  treatmentView,
  type GestureOutcome,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { DAY, line, setting, WEEK } from './dose-calendar.v2.aides'
import {
  arrete,
  carnet,
  dateDonnee,
  donne,
  echeance,
  jours,
  oublie,
  recoit,
  reprend,
  semaines,
  vue,
  type Carnet,
} from './dose-calendar.recette.aides'

const accepted = (result: ReturnType<typeof noteDose>) => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return result as GestureOutcome
}

const historyAfter = (input: TreatmentViewInput, result: GestureOutcome) =>
  treatmentView(applied(input, result.changes)).history.map(({ line, effect }) => [
    line.id,
    line.status,
    effect.kind,
  ])

const mark = (
  dueOn: string,
  status: 'given' | 'missed',
  settingId = 'p1',
  dueTime: string | null = null,
) => ({
  due: { settingId, dueOn, dueTime },
  status,
  givenOn: dueOn,
  shiftsFollowing: false,
})

// Vendredis d'octobre : 2, 9, 16, 23, 30.
const p1 = setting('p1', '2026-10-02', WEEK)

describe('#841, TR-25 : une note réécrit la ligne en vigueur, la ligne de l’autre appareil reste grisée (décision du 17 octobre 2026)', () => {
  it('dose du 16 donnée sur deux appareils, marquée oubliée : « Oubliée », la prise de l’autre appareil reste, sans effet', () => {
    const older = line('p1', 'given', '2026-10-16')
    const newer = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [older, newer], today: '2026-10-20' }
    const result = accepted(noteDose(input, mark('2026-10-16', 'missed')))
    expect(result.changes).toEqual([
      {
        action: 'rewrite',
        id: newer.id,
        line: {
          settingId: 'p1',
          dueOn: '2026-10-16',
          dueTime: null,
          status: 'missed',
          givenOn: null,
          targetOn: null,
        },
      },
    ])
    expect(historyAfter(input, result)).toEqual([
      [older.id, 'given', 'idle'],
      [newer.id, 'missed', 'covers'],
    ])
  })

  it('dose du 16 oubliée sur deux appareils, marquée donnée : « Donnée », l’oubli de l’autre appareil reste, sans effet', () => {
    const older = line('p1', 'missed', '2026-10-16')
    const newer = line('p1', 'missed', '2026-10-16')
    const input = { settings: [p1], lines: [older, newer], today: '2026-10-20' }
    const result = accepted(noteDose(input, mark('2026-10-16', 'given')))
    expect(result.changes.map(({ action }) => action)).toEqual(['rewrite'])
    expect(historyAfter(input, result)).toEqual([
      [older.id, 'missed', 'idle'],
      [newer.id, 'given', 'covers'],
    ])
  })

  it('une ligne grisée « · sans effet » d’une autre dose n’est pas touchée', () => {
    const shown = line('p1', 'given', '2026-10-16')
    const other = line('p1', 'given', '2026-10-09')
    const input = { settings: [p1], lines: [other, shown], today: '2026-10-20' }
    const result = accepted(noteDose(input, mark('2026-10-16', 'missed')))
    expect(result.changes.map(({ action }) => action)).toEqual(['rewrite'])
  })

  it('#822, entre deux périodes : tous les jours à 20 h, dose du 2 avr. donnée, arrêt le 2, reprise le 2 dès le 2, la même dose notée de nouveau, marquée oubliée : seule la ligne touchée change', () => {
    const stopped = setting('a1', '2026-03-30', DAY, ['20:00'], { stoppedOn: '2026-04-02' })
    const resumed = setting('a2', '2026-04-02', DAY, ['20:00'])
    const before = line('a1', 'given', '2026-04-02', '20:00')
    const again = line('a2', 'given', '2026-04-02', '20:00')
    const input = { settings: [stopped, resumed], lines: [before, again], today: '2026-04-04' }
    const result = accepted(noteDose(input, mark('2026-04-02', 'missed', 'a2', '20:00')))
    expect(
      result.changes.map((change) => [change.action, 'id' in change ? change.id : null]),
    ).toEqual([['rewrite', again.id]])
  })
})

// La synchro garde, pour chaque ligne, sa version la plus récente ; une ligne supprimée l'est partout.
function synchro(here: Carnet, other: Carnet, removed: readonly string[] = []): Carnet {
  const byId = new Map(here.doses.map((dose) => [dose.id, dose]))
  for (const dose of other.doses) {
    const kept = byId.get(dose.id)
    if (kept === undefined || dose.decidedAt > kept.decidedAt) byId.set(dose.id, dose)
  }
  const doses = [...byId.values()].filter(({ id }) => !removed.includes(id))
  return { periods: here.periods, doses }
}

// Les fiches de A et de B une fois synchronisées, B ayant reçu ou non la ligne de A avant son geste.
function apresSynchro(
  parA: Carnet,
  parB: Carnet,
  geste: (c: Carnet) => Carnet,
  recueAvant: boolean,
) {
  const avant = recueAvant ? synchro(parB, parA) : parB
  const apres = geste(avant)
  const removed = avant.doses.filter((dose) => !apres.doses.some(({ id }) => id === dose.id))
  const ids = removed.map(({ id }) => id)
  return { a: synchro(parA, apres, ids), b: synchro(apres, parA, ids) }
}

function fiche(c: Carnet, today: string, fromA: string) {
  return vue(c, today)
    .history.map(({ line: shown, effect }) => ({
      appareil: shown.id === fromA ? 'A' : 'B',
      status: shown.status,
      givenOn: shown.givenOn,
      effet: effect.kind === 'idle' ? `idle ${effect.reason}` : effect.kind,
    }))
    .sort((a, b) => a.appareil.localeCompare(b.appareil))
}

describe('#841 : Milo, chaque lundi à 8 h, dose du 16 mars notée sur A à 9 h 02 puis sur B à 9 h 05 (décision du 17 octobre 2026)', () => {
  const debut = () => carnet('2026-03-02', semaines(1), ['08:00'])
  const du16 = (c: Carnet) => echeance(c, '2026-03-16', '08:00')
  const ligneDeA = (avant: Carnet, apres: Carnet) =>
    apres.doses.find((dose) => !avant.doses.includes(dose))!.id

  function memeFicheSurLesDeux(
    parA: Carnet,
    parB: Carnet,
    geste: (c: Carnet) => Carnet,
    today: string,
    deA: string,
  ) {
    const fiches = [true, false].flatMap((recueAvant) => {
      const { a, b } = apresSynchro(parA, parB, geste, recueAvant)
      return [fiche(a, today, deA), fiche(b, today, deA)]
    })
    for (const each of fiches) expect(each).toEqual(fiches[0])
    return fiches[0]
  }

  it('B touche « Marquer comme oubliée » : dans les deux ordres de synchro, les deux téléphones montrent « Oubliée » et la prise de A grisée', () => {
    const c = debut()
    const parA = donne(c, '2026-03-16', du16(c), '2026-03-16', false)
    const parB = donne(c, '2026-03-16', du16(c), '2026-03-16', false)
    const oubliee = (here: Carnet) => oublie(here, '2026-03-16', du16(here))

    expect(memeFicheSurLesDeux(parA, parB, oubliee, '2026-03-16', ligneDeA(c, parA))).toEqual([
      { appareil: 'A', status: 'given', givenOn: '2026-03-16', effet: 'idle superseded' },
      { appareil: 'B', status: 'missed', givenOn: null, effet: 'covers' },
    ])
  })

  it('dose du 16 oubliée sur A puis sur B ; le 17, B touche « Fait à une autre date » (donnée le 17) : « Donnée le 17 » et l’oubli de A grisé, dans les deux ordres', () => {
    const c = debut()
    const parA = oublie(c, '2026-03-16', du16(c))
    const parB = oublie(c, '2026-03-16', du16(c))
    const faitLe17 = (here: Carnet) =>
      donne(here, '2026-03-17', dateDonnee(here, '2026-03-17', '2026-03-17'), '2026-03-17', false)

    expect(memeFicheSurLesDeux(parA, parB, faitLe17, '2026-03-17', ligneDeA(c, parA))).toEqual([
      { appareil: 'A', status: 'missed', givenOn: null, effet: 'idle superseded' },
      { appareil: 'B', status: 'given', givenOn: '2026-03-17', effet: 'covers' },
    ])
  })

  it('dose du 16 oubliée sur A puis sur B ; B touche « Marquer comme donnée » dans l’historique : « Donnée » et l’oubli de A grisé, dans les deux ordres', () => {
    const c = debut()
    const parA = oublie(c, '2026-03-16', du16(c))
    const parB = oublie(c, '2026-03-16', du16(c))
    const marqueeDonnee = (here: Carnet) =>
      donne(here, '2026-03-17', du16(here), '2026-03-16', false)

    expect(memeFicheSurLesDeux(parA, parB, marqueeDonnee, '2026-03-17', ligneDeA(c, parA))).toEqual(
      [
        { appareil: 'A', status: 'missed', givenOn: null, effet: 'idle superseded' },
        { appareil: 'B', status: 'given', givenOn: '2026-03-16', effet: 'covers' },
      ],
    )
  })

  it('un seul téléphone : la dose du 16 donnée puis marquée oubliée n’a qu’une ligne, « Oubliée »', () => {
    const c = debut()
    const donnee = donne(c, '2026-03-16', du16(c), '2026-03-16', false)
    const oubliee = oublie(donnee, '2026-03-16', du16(donnee))
    expect(oubliee.doses).toMatchObject([{ dueOn: '2026-03-16', status: 'missed', givenOn: null }])
    expect(vue(oubliee, '2026-03-16').history.map(({ effect }) => effect.kind)).toEqual(['covers'])
  })
})

describe('#841 : le jour d’un arrêt suivi d’une reprise le même jour', () => {
  it('Milo, tous les jours à 20 h depuis le 30 mars, dose du 2 avr. donnée sur deux appareils ; le 2, arrêt puis reprise dès le 2 ; le 4, « Marquer comme oubliée » : « Oubliée », la prise de l’autre appareil grisée', () => {
    let c = carnet('2026-03-30', jours(1), ['20:00'])
    for (const day of ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02']) {
      c = donne(c, day, echeance(c, day, '20:00'), day, false)
    }
    c = recoit(c, echeance(c, '2026-04-02', '20:00'))
    c = arrete(c, '2026-04-02')
    c = reprend(c, '2026-04-02', '2026-04-02', jours(1), ['20:00'])
    c = oublie(c, '2026-04-04', { periodId: 'p1', dueOn: '2026-04-02', dueTime: '20:00' })

    const ofThe2nd = c.doses.filter(({ dueOn }) => dueOn === '2026-04-02')
    expect(ofThe2nd).toHaveLength(2)
    expect(ofThe2nd).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ periodId: 'p1', status: 'missed', givenOn: null }),
        expect.objectContaining({ periodId: 'p1', status: 'given', givenOn: '2026-04-02' }),
      ]),
    )
    expect(
      vue(c, '2026-04-04')
        .history.filter(({ line: shown }) => shown.dueOn === '2026-04-02')
        .map(({ line: shown, effect }) => [shown.status, effect.kind]),
    ).toEqual(
      expect.arrayContaining([
        ['missed', 'covers'],
        ['given', 'idle'],
      ]),
    )
  })
})
