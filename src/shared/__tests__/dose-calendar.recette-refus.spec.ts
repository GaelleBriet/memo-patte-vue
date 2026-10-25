// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  moveBounds,
  noteDose,
  redateDose,
  removalRefusal,
  type Refusal,
} from '../domain/dose-calendar'
import { outcome } from '../domain/dose-calendar/gestures/outcome'
import { DAY, H, line, MONTH, setting, WEEK } from './dose-calendar.v2.aides'

// Jeu de recette du moteur v2 (épic #758, pas 3) : chaque refus d'un geste, sur un carnet daté, et le
// texte existant que l'écran affiche pour lui (aucun texte nouveau).

const TEXTS: Record<Refusal['reason'], string[]> = {
  'later-dose': [
    'treatments.form.nextDoseOn.refusal.laterDose',
    'treatments.history.refusal.shiftLaterDose',
  ],
  'later-line': ['treatments.form.nextDoseOn.refusal.laterLine'],
  'no-date-left': ['treatments.form.nextDoseOn.refusal.noDateLeft'],
  'no-date-alone': ['treatments.form.errors.nextDoseOnRefused', 'treatments.shift.aloneLatest'],
  'no-dose-before-end': ['treatments.form.nextDoseOn.refusal.noDoseBeforeEnd'],
  'arrival-logged': ['treatments.form.nextDoseOn.refusal.arrivalLogged'],
  'not-movable': ['treatments.form.errors.nextDoseOnRefused'],
  'unknown-due': [],
  'out-of-bounds': ['treatments.shift.aloneLatest'],
  'too-early': [],
  'day-taken': [],
  'stuck-report': ['treatments.shift.stuckMove'],
  'report-loop': ['treatments.history.refusal.shiftMovePastNext'],
  'report-past-next': ['treatments.history.refusal.shiftMovePastNext'],
  'report-off-rhythm': ['treatments.history.refusal.shiftMoveOffRhythm'],
  'arrival-shared': ['treatments.history.refusal.arrivalShared'],
}

const locale = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../core/i18n/locales/${name}.json`, import.meta.url), 'utf8'),
  ) as Record<string, unknown>
const textOf = (messages: Record<string, unknown>, key: string) =>
  key
    .split('.')
    .reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], messages)

describe('refus des gestes, textes existants', () => {
  it.each(['fr', 'en'])(
    'chaque refus a un texte existant en %s (jours grisés pour « too-early » et « day-taken », échéance que l’écran ne propose pas pour « unknown-due »)',
    (name) => {
      const messages = locale(name)
      const missing = Object.values(TEXTS)
        .flat()
        .filter((key) => typeof textOf(messages, key) !== 'string')
      expect(missing).toEqual([])
    },
  )
})

// Vendredis d'octobre : 2, 9, 16, 23, 30.
const hebdo = setting('p1', '2026-10-02', WEEK)
const due = (dueOn: string, dueTime: string | null = null) => ({ settingId: 'p1', dueOn, dueTime })

describe('un cas daté par refus', () => {
  it('Q20 : fin le 16, 8 h du 16 donnée : 20 h du 16 n’a plus aucune date avant la date de fin', () => {
    const p1 = setting('p1', '2026-10-02', WEEK, H, { endsOn: '2026-10-16' })
    const input = {
      settings: [p1],
      lines: [line('p1', 'given', '2026-10-16', '08:00')],
      today: '2026-10-16',
    }
    expect(moveBounds(input, due('2026-10-16', '20:00'), true)).toEqual({
      refusal: { reason: 'no-date-left' },
    })
  })

  it('Q2 a : tous les jours, la dose du jour, seule, n’a aucune date avant la suivante', () => {
    const input = { settings: [setting('p1', '2026-10-01', DAY)], lines: [], today: '2026-10-05' }
    expect(moveBounds(input, due('2026-10-05'), false)).toEqual({
      refusal: { reason: 'no-date-alone' },
    })
  })

  it('G19 : le 8 nov., dose du 16 donnée le 19 avec décalage, dose du 26 reportée seule au 30 : corrigée au 17, aucune date ne convient au report', () => {
    const prise = { ...line('p1', 'given', '2026-10-16'), givenOn: '2026-10-19' }
    const lines = [
      line('p1', 'given', '2026-10-09'),
      prise,
      line('p1', 'shift', '2026-10-16', null, '2026-10-19'),
      line('p1', 'postponed', '2026-10-26', null, '2026-10-30'),
    ]
    const input = { settings: [hebdo], lines, today: '2026-11-08' }
    expect(
      redateDose(input, { lineId: prise.id, givenOn: '2026-10-17', shiftsFollowing: true }),
    ).toEqual({
      refusal: { reason: 'stuck-report', on: '2026-10-30' },
    })
  })

  it('G19, #786 : « Fait à une autre date » coché, un report seul après la prise : accepté, le report suit', () => {
    const lines = [
      line('p1', 'given', '2026-10-09'),
      line('p1', 'postponed', '2026-10-23', null, '2026-10-27'),
    ]
    const result = noteDose(
      { settings: [hebdo], lines, today: '2026-10-19' },
      {
        due: due('2026-10-16'),
        status: 'given',
        givenOn: '2026-10-19',
        shiftsFollowing: true,
      },
    )
    expect('refusal' in result ? result : result.followed).toEqual([
      { from: '2026-10-27', to: '2026-10-27' },
    ])
  })

  it('R7, #763 : dose du 16 reportée seule au 21 ; un geste qui avancerait la dose du 23 au 16 la renverrait entre deux reports : refusé', () => {
    const first = line('p1', 'postponed', '2026-10-16', null, '2026-10-21')
    const input = { settings: [hebdo], lines: [first], today: '2026-10-12' }
    const loop = {
      action: 'create' as const,
      line: {
        settingId: 'p1',
        dueOn: '2026-10-23',
        dueTime: null,
        status: 'postponed' as const,
        givenOn: null,
        targetOn: '2026-10-16',
      },
    }
    expect(outcome(input, [loop])).toEqual({ refusal: { reason: 'report-loop' } })
    expect(
      outcome(input, [{ ...loop, line: { ...loop.line, targetOn: '2026-10-22' } }]),
    ).not.toHaveProperty('refusal')
  })

  it('R7, #763 : mensuel du 16 mars, prise du 16 donnée le 19 avec décalage, doses du 19 avr. avancée au 15 et du 19 mai avancée au 20 avr. ; la prise ramenée au 16 ferait se renvoyer les deux reports : refusé', () => {
    const p1 = setting('p1', '2026-03-16', MONTH)
    const p2 = setting('p2', '2026-04-20', MONTH, [], {
      startsOn: '2026-03-19',
      gridOriginOn: null,
    })
    const prise = { ...line('p1', 'given', '2026-03-16'), givenOn: '2026-03-19' }
    const lines = [
      line('p1', 'shift', '2026-03-16', null, '2026-03-19'),
      prise,
      line('p1', 'postponed', '2026-04-19', null, '2026-04-15'),
      line('p1', 'postponed', '2026-05-19', null, '2026-04-20'),
    ]
    const input = { settings: [p1, p2], lines, today: '2026-03-19' }
    expect(
      redateDose(input, { lineId: prise.id, givenOn: '2026-03-16', shiftsFollowing: false }),
    ).toEqual({ refusal: { reason: 'report-loop' } })
  })

  it('N8 : décalage du 16 au 19, dose du 26 donnée : « Supprimer ce décalage » refusé', () => {
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const input = {
      settings: [hebdo],
      lines: [shift, line('p1', 'given', '2026-10-26')],
      today: '2026-10-27',
    }
    expect(removalRefusal(input, shift.id)).toEqual({ reason: 'later-dose' })
  })
})
