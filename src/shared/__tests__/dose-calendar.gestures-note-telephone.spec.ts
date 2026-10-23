// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  noteDose,
  treatmentView,
  type GestureOutcome,
  type Line,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { setting, WEEK } from './dose-calendar.v2.aides'

// Milo, chaque lundi à 8 h depuis le 2 mars : 2, 9, 16, 23, 30.
const milo = setting('p1', '2026-03-02', WEEK, ['08:00'])
const du16 = { settingId: 'p1', dueOn: '2026-03-16', dueTime: '08:00' }

function prise(
  id: string,
  device: string,
  status: 'given' | 'missed',
  givenOn: string | null,
  decidedAt: string,
): Line {
  return {
    id,
    settingId: 'p1',
    dueOn: '2026-03-16',
    dueTime: '08:00',
    status,
    givenOn,
    targetOn: null,
    decidedAt,
    createdByDevice: device,
  }
}

const accepted = (result: ReturnType<typeof noteDose>) => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return result as GestureOutcome
}

// Ce que le téléphone écrit : une réécriture garde l'identifiant et l'appareil qui a créé la ligne.
function written(lines: readonly Line[], result: GestureOutcome, device: string, at: string) {
  let next = [...lines]
  result.changes.forEach((change, index) => {
    if (change.action === 'delete') next = next.filter(({ id }) => id !== change.id)
    else if (change.action === 'rewrite')
      next = next.map((line) =>
        line.id === change.id ? { ...line, ...change.line, decidedAt: at } : line,
      )
    else
      next = [
        ...next,
        { ...change.line, id: `${device}${index}`, decidedAt: at, createdByDevice: device },
      ]
  })
  return next
}

// La synchro garde, pour chaque ligne, sa version la plus récente.
function synced(...phones: (readonly Line[])[]): Line[] {
  const byId = new Map<string, Line>()
  for (const line of phones.flat()) {
    const kept = byId.get(line.id)
    if (kept === undefined || line.decidedAt > kept.decidedAt) byId.set(line.id, line)
  }
  return [...byId.values()]
}

function fiche(lines: readonly Line[], today: string) {
  return treatmentView({ settings: [milo], lines, today })
    .history.map(({ line, effect }) => ({
      appareil: line.createdByDevice,
      status: line.status,
      givenOn: line.givenOn,
      effet: effect.kind === 'idle' ? `idle ${effect.reason}` : effect.kind,
    }))
    .sort((a, b) => (a.appareil ?? '').localeCompare(b.appareil ?? ''))
}

// Le geste fait sur `device`, qui a reçu ou non la ligne de l'autre téléphone avant lui.
function apresSynchro(
  ici: readonly Line[],
  autre: readonly Line[],
  device: string,
  today: string,
  geste: (input: TreatmentViewInput) => ReturnType<typeof noteDose>,
  recueAvant: boolean,
) {
  const avant = recueAvant ? synced(ici, autre) : [...ici]
  const input = { settings: [milo], lines: avant, today, device }
  const apres = written(avant, accepted(geste(input)), device, `${today}T09:00:00.000Z`)
  return { a: synced(autre, apres), b: synced(apres, autre) }
}

const marqueeOubliee = (input: TreatmentViewInput) =>
  noteDose(input, { due: du16, status: 'missed', givenOn: '2026-03-16', shiftsFollowing: false })

describe('#931 : un geste de note réécrit la ligne du téléphone qui le fait (décision du 18 octobre 2026)', () => {
  const parB = [prise('b16', 'B', 'given', '2026-03-16', '2026-03-16T09:00:00.000Z')]
  const parA = [prise('a16', 'A', 'given', '2026-03-17', '2026-03-17T09:00:00.000Z')]

  it.each([true, false])(
    'dose du 16 mars donnée sur B le 16 et sur A le 17 ; le 18, sur B, « Marquer comme oubliée » (prise de A reçue avant : %s) : « Oubliée » et « Donnée le 17 · sans effet » sur les deux téléphones',
    (recueAvant) => {
      const { a, b } = apresSynchro(parB, parA, 'B', '2026-03-18', marqueeOubliee, recueAvant)
      const attendu = [
        { appareil: 'A', status: 'given', givenOn: '2026-03-17', effet: 'idle superseded' },
        { appareil: 'B', status: 'missed', givenOn: null, effet: 'covers' },
      ]
      expect(fiche(a, '2026-03-18')).toEqual(attendu)
      expect(fiche(b, '2026-03-18')).toEqual(attendu)
    },
  )

  it('la prise de A reçue avant le geste : seule la ligne de B est réécrite', () => {
    const input = { settings: [milo], lines: synced(parB, parA), today: '2026-03-18', device: 'B' }
    expect(accepted(marqueeOubliee(input)).changes).toEqual([
      {
        action: 'rewrite',
        id: 'b16',
        line: { ...du16, status: 'missed', givenOn: null, targetOn: null },
      },
    ])
  })

  it.each([true, false])(
    'dose du 16 mars oubliée sur B puis sur A ; le 18, sur B, « Fait à une autre date » le 18 (oubli de A reçu avant : %s) : « Donnée le 18 » sur la ligne de B, l’oubli de A grisé',
    (recueAvant) => {
      const oublieB = [prise('b16', 'B', 'missed', null, '2026-03-16T09:00:00.000Z')]
      const oublieA = [prise('a16', 'A', 'missed', null, '2026-03-17T09:00:00.000Z')]
      const faitLe18 = (input: TreatmentViewInput) =>
        noteDose(input, {
          due: du16,
          status: 'given',
          givenOn: '2026-03-18',
          shiftsFollowing: false,
        })
      const { a, b } = apresSynchro(oublieB, oublieA, 'B', '2026-03-18', faitLe18, recueAvant)
      const attendu = [
        { appareil: 'A', status: 'missed', givenOn: null, effet: 'idle superseded' },
        { appareil: 'B', status: 'given', givenOn: '2026-03-18', effet: 'covers' },
      ]
      expect(fiche(a, '2026-03-18')).toEqual(attendu)
      expect(fiche(b, '2026-03-18')).toEqual(attendu)
    },
  )

  it('un téléphone sans ligne sur la dose réécrit la plus récente, comme avant', () => {
    const input = { settings: [milo], lines: synced(parB, parA), today: '2026-03-18', device: 'C' }
    expect(accepted(marqueeOubliee(input)).changes).toMatchObject([
      { action: 'rewrite', id: 'a16' },
    ])
  })

  describe('trois téléphones : A et C ont chacun une ligne sur la dose du 16 mars, B aucune ; le 18, sur B, « Marquer comme oubliée », les deux lignes reçues', () => {
    const deA = (at: string) => [prise('a16', 'A', 'given', '2026-03-16', at)]
    const deC = (at: string) => [prise('c16', 'C', 'given', '2026-03-17', at)]

    it.each([
      [
        'C plus récente, reçue après A',
        deA('2026-03-16T09:00:00.000Z'),
        deC('2026-03-17T09:00:00.000Z'),
        'c16',
      ],
      [
        'C plus récente, reçue avant A',
        deC('2026-03-17T09:00:00.000Z'),
        deA('2026-03-16T09:00:00.000Z'),
        'c16',
      ],
      [
        'A plus récente, reçue après C',
        deC('2026-03-16T09:00:00.000Z'),
        deA('2026-03-17T10:00:00.000Z'),
        'a16',
      ],
      [
        'A plus récente, reçue avant C',
        deA('2026-03-17T10:00:00.000Z'),
        deC('2026-03-16T09:00:00.000Z'),
        'a16',
      ],
    ])(
      '%s : B réécrit la ligne la plus récente, et les trois téléphones montrent la même fiche',
      (_, first, second, rewritten) => {
        const input = {
          settings: [milo],
          lines: [...first, ...second],
          today: '2026-03-18',
          device: 'B',
        }
        const result = accepted(marqueeOubliee(input))
        expect(result.changes).toMatchObject([{ action: 'rewrite', id: rewritten }])
        const surB = written(input.lines, result, 'B', '2026-03-18T09:00:00.000Z')
        const fiches = [synced(first, surB), synced(second, surB), surB].map((lines) =>
          fiche(synced(first, second, lines), '2026-03-18'),
        )
        for (const each of fiches) expect(each).toEqual(fiches[0])
        expect(fiches[0]).toContainEqual(
          expect.objectContaining({ status: 'missed', effet: 'covers' }),
        )
      },
    )
  })

  it('sans téléphone connu (hors de l’app), la ligne en vigueur est réécrite, comme avant', () => {
    const input = { settings: [milo], lines: synced(parB, parA), today: '2026-03-18' }
    expect(accepted(marqueeOubliee(input)).changes).toMatchObject([
      { action: 'rewrite', id: 'a16' },
    ])
  })
})

describe('#931 : la simulation d’un geste garde le téléphone de chaque ligne, comme le repository', () => {
  it('une ligne réécrite garde le téléphone qui l’a créée ; une ligne créée prend celui du geste', () => {
    const lines = [prise('b16', 'B', 'given', '2026-03-16', '2026-03-16T09:00:00.000Z')]
    const after = applied({ settings: [milo], lines, today: '2026-03-18', device: 'A' }, [
      {
        action: 'rewrite',
        id: 'b16',
        line: { ...du16, status: 'missed', givenOn: null, targetOn: null },
      },
      {
        action: 'create',
        line: {
          ...du16,
          dueOn: '2026-03-09',
          status: 'given',
          givenOn: '2026-03-09',
          targetOn: null,
        },
      },
    ])
    expect(after.lines.map((line) => [line.status, line.createdByDevice])).toEqual([
      ['missed', 'B'],
      ['given', 'A'],
    ])
  })
})
