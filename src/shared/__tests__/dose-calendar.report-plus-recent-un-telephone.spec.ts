// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { mulberry32 } from '../../../scripts/dose-engine/carnet'
import { brokenBy } from '../../../scripts/dose-engine/v2-invariants'
import { startV2Walk, v2Step, type V2Step } from '../../../scripts/dose-engine/v2-walk'
import {
  moveDose,
  newSettings,
  noteDose,
  removeLine,
  settingsApplied,
  treatmentView,
  type LineChange,
  type SettingsPlan,
  type SettingsRequest,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { rewrittenOn } from './dose-calendar.reglage-corrige.aides'
import { keys } from './dose-calendar.v2.aides'

// #882, #883 sur un seul téléphone : une dose ôtée par un décalage ou par sa suppression, pas par la
// réécriture du réglage, se lit comme avant (relecture de la PR #934).

function seedHolds(seed: number, steps: number): string[] {
  const walk = startV2Walk(seed)
  const checks = mulberry32(seed ^ 0x4f1bbcdc)
  const broken: string[] = []
  const onStep = (step: V2Step) => {
    const found = brokenBy(step, checks)
    if (found !== null) broken.push(`${step.label} : ${found.invariant}`)
  }
  for (let count = 0; count < steps; count += 1) v2Step(walk, onStep)
  return broken
}

// Le téléphone : chaque écriture datée après la précédente, la réécriture du réglage comprise.
function phone(start: TreatmentViewInput) {
  let input = start
  let tick = 0
  const stamp = () => new Date(Date.UTC(2026, 2, 15, 9, 0, ++tick)).toISOString()
  const write = (changes: readonly LineChange[]) => {
    let lines = [...input.lines]
    for (const change of changes) {
      if (change.action === 'delete') {
        lines = lines.filter(({ id }) => id !== change.id)
        continue
      }
      const updatedAt = stamp()
      lines =
        change.action === 'rewrite'
          ? lines.map((l) => (l.id === change.id ? { ...change.line, id: l.id, updatedAt } : l))
          : [...lines, { ...change.line, id: `l${tick}`, updatedAt }]
    }
    input = { ...input, lines }
  }
  const settle = (plan: SettingsPlan) => {
    if (plan.action === 'rewrite') {
      const at = stamp()
      const applied = settingsApplied({ ...input, lines: [] }, { ...plan, lines: [] })
      const settings = applied.settings.map((s, index) =>
        s.id === plan.id ? rewrittenOn(input.settings[index]!, s, at) : s,
      )
      input = { ...input, settings }
    } else {
      const created = { ...plan.setting, id: `s${input.settings.length + 1}`, stoppedOn: null }
      input = { ...input, settings: [...input.settings, { ...created, createdAt: stamp() }] }
    }
    write(plan.lines ?? [])
  }
  const ok = <T extends object>(result: T): Exclude<T, { refusal: unknown }> => {
    if ('refusal' in result) throw new Error(JSON.stringify(result))
    return result as Exclude<T, { refusal: unknown }>
  }
  const settingId = () => treatmentView(input).currentSetting!.id
  return {
    get input() {
      return input
    },
    note: (dueOn: string, dueTime: string, shiftsFollowing: boolean) =>
      write(
        ok(
          noteDose(input, {
            due: { settingId: settingId(), dueOn, dueTime },
            status: 'given',
            givenOn: input.today,
            shiftsFollowing,
          }),
        ).changes,
      ),
    move: (dueOn: string, dueTime: string, to: string) =>
      write(
        ok(
          moveDose(input, {
            due: { settingId: settingId(), dueOn, dueTime },
            to,
            shiftsFollowing: true,
          }),
        ).changes,
      ),
    remove: (id: string) => write(ok(removeLine(input, id)).changes),
    modify: (request: SettingsRequest) => {
      const answer = ok(newSettings(input, request))
      const plan = 'plan' in answer ? answer.plan : answer.question.keep
      settle(ok(plan))
    },
  }
}

const upcoming = (input: TreatmentViewInput) => ({
  moteur: keys(treatmentView(input).upcoming({ limit: 8 })),
  reference: referenceReading({ ...input, until: '2026-06-30' }).upcoming.slice(0, 8),
})

describe('Un seul téléphone : une dose ôtée par un décalage, pas par la réécriture, se lit comme avant', () => {
  it('graine 9000000692 : les invariants tiennent à chaque geste, posologie seule comprise', () => {
    expect(seedHolds(9000000692, 40)).toEqual([])
  })

  // Tous les mois à 8 h et 20 h depuis le 16 mars, réglage réécrit le jour même ; la dose du 16 donnée
  // d'avance avec la case (grille au 11), celle du 11 avril avancée au 31 mars ; le 15, « Prochaine
  // dose » le 19 (nouveau réglage, origine propre), puis posologie seule : le 11 avril n'est plus une
  // échéance, ôté par le réglage du 15 et non par la réécriture du 16.
  it('graine 9000001436 : un réglage intermédiaire qui pose sa propre origine n’est pas une réécriture, le report reste sans effet', () => {
    const walk = startV2Walk(9000001436)
    for (let count = 0; count <= 14; count += 1) v2Step(walk, () => {})
    const report = walk.input.lines.find(
      ({ status, dueOn }) => status === 'postponed' && dueOn === '2026-04-11',
    )!
    const effect = treatmentView(walk.input).history.find(({ line }) => line.id === report.id)!
    expect(effect.effect).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(upcoming(walk.input).moteur).toEqual(['2026-03-19 20:00'])
    expect(upcoming(walk.input).reference).toEqual(upcoming(walk.input).moteur)
  })

  // Q3 (décision du 19 octobre 2026) : un report porte l'heure écrite dans sa ligne (#867), même quand
  // elle n'existe pas dans son réglage : la dose de 8 h du 28 mars avancée au 25 y arrive à 8 h.
  it('graine 9000000824 : le report de la dose de 8 h arrive à 8 h, même dans un réglage à 20 h', () => {
    const walk = startV2Walk(9000000824)
    for (let count = 0; count <= 38; count += 1) v2Step(walk, () => {})
    expect(upcoming(walk.input).moteur[0]).toBe('2026-03-25 08:00')
    expect(upcoming(walk.input).reference).toEqual(upcoming(walk.input).moteur)
  })

  // Décision du 19 octobre 2026 (G13 appliqué au décalage) : tous les jours à 20 h, la dose reportée du
  // 19 sur la date choisie du 27, puis avancée au 26 avec la case : le décalage se juge depuis son
  // ancienne arrivée, le 27, et les jours suivants avancent d'autant.
  it('graine 9100000170, pas 12 : la dose du 27 avancée au 26 avec la case : le 26, le 27, le 28', () => {
    const walk = startV2Walk(9100000170)
    for (let count = 0; count <= 12; count += 1) v2Step(walk, () => {})
    expect(upcoming(walk.input).moteur.slice(0, 4)).toEqual([
      '2026-03-26 20:00',
      '2026-03-27 20:00',
      '2026-03-28 20:00',
      '2026-03-29 20:00',
    ])
    expect(upcoming(walk.input).reference).toEqual(upcoming(walk.input).moteur)
  })

  // #939 : l'aperçu date la grille d'une réécriture comme l'écriture, puisque le report se juge contre
  // elle : préversion et résultat restent les mêmes ; une posologie seule ne change rien.
  // Q1 : la date choisie se lit sur le réglage qui a tracé la grille du jour, que continuent les
  // réglages suivants sans origine à eux ; lue au départ et sur l'ancienne arrivée, la dose arrive une fois.
  it.each([
    9110000172, 9110000229, 9110000309, 9120000384, 9120001368, 9140000610, 9140000713, 9140000967,
  ])('graine %i : les invariants tiennent à chaque geste', (seed) => {
    expect(seedHolds(seed, 40)).toEqual([])
  })

  it('graine 9500001489 : les invariants tiennent à chaque geste, posologie seule comprise', () => {
    expect(seedHolds(9500001489, 40)).toEqual([])
  })

  // Milo, toutes les 2 semaines à 20 h : 27 mars donné d'avance avec la case, puis 8 h, 14 h et 20 h,
  // la dose de 8 h du 29 mars reportée au 8 avril avec la case, puis le décalage du 27 supprimé.
  it('Milo : supprimer le décalage du 27 mars ne retire pas les doses de 14 h et 20 h, et une posologie seule ne change rien', () => {
    const milo = phone({
      settings: [
        {
          id: 's1',
          startsOn: '2026-03-13',
          firstDueOn: '2026-03-13',
          gridOriginOn: '2026-03-13',
          firstDueChosen: true,
          fallenDosesAnswer: 'unasked',
          endsOn: '2026-04-26',
          stoppedOn: null,
          frequency: { value: 2, unit: 'week' },
          times: ['20:00'],
          createdAt: '2026-03-01T00:00:00.000Z',
        },
      ],
      lines: [],
      today: '2026-03-15',
    })
    const TWO_WEEKS = { value: 2, unit: 'week' as const }
    milo.note('2026-03-13', '20:00', false)
    milo.note('2026-03-27', '20:00', true)
    milo.modify({ frequency: TWO_WEEKS, times: ['20:00'], endsOn: '2026-04-16' })
    milo.modify({ frequency: TWO_WEEKS, times: ['08:00', '14:00', '20:00'], endsOn: '2026-04-16' })
    milo.move('2026-03-29', '08:00', '2026-04-08')
    const shift = milo.input.lines.find(
      ({ status, dueOn }) => status === 'shift' && dueOn === '2026-03-27',
    )!
    milo.remove(shift.id)
    const expected = [
      '2026-04-08 08:00',
      '2026-04-08 14:00',
      '2026-04-08 20:00',
      '2026-04-10 08:00',
      '2026-04-10 14:00',
      '2026-04-10 20:00',
    ]
    expect(upcoming(milo.input)).toEqual({ moteur: expected, reference: expected })
    milo.modify({ frequency: TWO_WEEKS, times: ['08:00', '14:00', '20:00'], endsOn: '2026-04-16' })
    expect(upcoming(milo.input)).toEqual({ moteur: expected, reference: expected })
  })

  // Chaque mercredi à 20 h, puis à 8 h dès le 1er avril (réglage réécrit plus tard) ; la dose de 20 h
  // du 25 mars reportée au 8 avril, puis reportée de nouveau du 8 au 9.
  it('une heure arrivée par un autre report n’est pas ôtée par la réécriture : le second report tient', () => {
    const WEEK = { value: 1, unit: 'week' as const }
    const base = {
      startsOn: '2026-03-25',
      gridOriginOn: '2026-03-25',
      firstDueChosen: true,
      fallenDosesAnswer: 'unasked' as const,
      endsOn: null,
      stoppedOn: null,
      frequency: WEEK,
    }
    const input: TreatmentViewInput = {
      settings: [
        {
          ...base,
          id: 's0',
          firstDueOn: '2026-03-25',
          times: ['20:00'],
          createdAt: '2026-03-01T08:00:00.000Z',
        },
        {
          ...base,
          id: 's1',
          startsOn: '2026-04-01',
          firstDueOn: '2026-04-01',
          gridOriginOn: '2026-04-01',
          times: ['08:00'],
          createdAt: '2026-03-30T08:00:00.000Z',
          updatedAt: '2026-04-07T08:00:00.000Z',
        },
      ],
      lines: [
        {
          id: 'r1',
          settingId: 's0',
          dueOn: '2026-03-25',
          dueTime: '20:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-04-08',
          updatedAt: '2026-03-24T08:00:00.000Z',
        },
        {
          id: 'r2',
          settingId: 's1',
          dueOn: '2026-04-08',
          dueTime: '20:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-04-09',
          updatedAt: '2026-04-06T08:00:00.000Z',
        },
      ],
      today: '2026-04-07',
    }
    const effect = treatmentView(input).history.find(({ line }) => line.id === 'r2')!.effect
    expect(effect).toMatchObject({ kind: 'moves', arrival: '2026-04-09' })
    expect(upcoming(input).moteur.slice(0, 2)).toEqual(['2026-04-08 08:00', '2026-04-09 20:00'])
    expect(upcoming(input).reference).toEqual(upcoming(input).moteur)
  })
})
