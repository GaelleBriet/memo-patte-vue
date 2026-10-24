// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  noteDose,
  redateDose,
  treatmentView,
  type GestureOutcome,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { keys, line, setting, WEEK } from './dose-calendar.v2.aides'

const accepted = (result: ReturnType<typeof redateDose | typeof noteDose>) => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return result as GestureOutcome
}

// Vendredis d'octobre : 2, 9, 16, 23, 30.
const p1 = setting('p1', '2026-10-02', WEEK)
const base = [line('p1', 'given', '2026-10-02'), line('p1', 'given', '2026-10-09')]

describe('« Changer la date » d’une prise (TR-24 bis, Q30, G12, G19, G21)', () => {
  it('Q30 : dose du 16 notée le 16, corrigée le 25 « donnée le 24 », case cochée : elle reste la dose du 16, rien à renseigner, 31 oct.', () => {
    const prise = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [...base, prise], today: '2026-10-25' }
    const result = accepted(
      redateDose(input, { lineId: prise.id, givenOn: '2026-10-24', shiftsFollowing: true }),
    )
    expect(result.offersShift).toBe(true)
    const after = applied(input, result.changes)
    const rewritten = after.lines.find(({ id }) => id === prise.id)
    expect([rewritten?.dueOn, rewritten?.givenOn]).toEqual(['2026-10-16', '2026-10-24'])
    const read = treatmentView(after)
    expect([keys(read.currentDoses), keys(read.unloggedDoses)]).toEqual([['2026-10-31'], []])
  })

  for (const [checked, current, unlogged, suite] of [
    [true, ['2026-10-24'], [], ['2026-10-24', '2026-10-31']],
    [false, ['2026-10-16'], ['2026-10-09'], ['2026-10-23', '2026-10-30']],
  ] as const) {
    it(`Q30 : prise du 2 donnée ; le 20, la prise du 2 corrigée au 17, case ${checked ? 'cochée' : 'décochée'} : elle reste la dose du 2, puis ${suite[0].slice(8)}`, () => {
      const prise = line('p1', 'given', '2026-10-02')
      const input = { settings: [p1], lines: [prise], today: '2026-10-20' }
      const gesture = { lineId: prise.id, givenOn: '2026-10-17', shiftsFollowing: checked }
      const result = accepted(redateDose(input, gesture))
      expect(result.offersShift).toBe(true)
      const after = applied(input, result.changes)
      const rewritten = after.lines.find(({ id }) => id === prise.id)
      expect([rewritten?.dueOn, rewritten?.givenOn]).toEqual(['2026-10-02', '2026-10-17'])
      const read = treatmentView(after)
      expect([keys(read.currentDoses), keys(read.unloggedDoses)]).toEqual([current, unlogged])
      expect(keys(read.upcoming({ limit: 2 }))).toEqual(suite)
    })
  }

  it('R5 : une prise donnée ne descend pas à un intervalle ou plus avant son échéance (jours grisés)', () => {
    const prise = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [...base, prise], today: '2026-10-16' }
    expect(
      redateDose(input, { lineId: prise.id, givenOn: '2026-10-09', shiftsFollowing: true }),
    ).toEqual({
      refusal: { reason: 'too-early', earliest: '2026-10-10' },
    })
  })

  it('R6 : une prise existe plus loin : pas de case, le calendrier ne bouge pas', () => {
    const prise = line('p1', 'given', '2026-10-09')
    const input = {
      settings: [p1],
      lines: [line('p1', 'given', '2026-10-02'), prise, line('p1', 'given', '2026-10-16')],
      today: '2026-10-17',
    }
    const result = accepted(
      redateDose(input, { lineId: prise.id, givenOn: '2026-10-11', shiftsFollowing: true }),
    )
    expect([result.offersShift, result.changes.length]).toEqual([false, 1])
  })

  it('G19 : dose du 16 donnée le 19 avec décalage, dose du 26 reportée seule au 30 ; corrigée au 17 : « Avancée au 30 oct. (prévue le 31 oct.) »', () => {
    const prise = { ...line('p1', 'given', '2026-10-16'), givenOn: '2026-10-19' }
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const report = line('p1', 'postponed', '2026-10-26', null, '2026-10-30')
    const input = { settings: [p1], lines: [...base, prise, shift, report], today: '2026-10-27' }
    const result = accepted(
      redateDose(input, { lineId: prise.id, givenOn: '2026-10-17', shiftsFollowing: true }),
    )
    expect(result.followed).toEqual([{ from: '2026-10-30', to: '2026-10-30' }])
    const rewritten = applied(input, result.changes).lines.find(({ id }) => id === report.id)
    expect([rewritten?.dueOn, rewritten?.targetOn]).toEqual(['2026-10-31', '2026-10-30'])
  })

  it('G21 : corrigée au 12, la dose du 19 sera à renseigner, et seulement elle', () => {
    const prise = { ...line('p1', 'given', '2026-10-16'), givenOn: '2026-10-19' }
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const input = { settings: [p1], lines: [...base, prise, shift], today: '2026-10-27' }
    const result = accepted(
      redateDose(input, { lineId: prise.id, givenOn: '2026-10-12', shiftsFollowing: true }),
    )
    expect(keys(result.newlyDue)).toEqual(['2026-10-19'])
  })

  it('G19 : dose du 16 reportée seule au 21 ; la prise du 9 corrigée au 11, cochée : le report suit, « Reportée au 21 oct. (prévue le 18 oct.) »', () => {
    const prise = line('p1', 'given', '2026-10-09')
    const report = line('p1', 'postponed', '2026-10-16', null, '2026-10-21')
    const input = {
      settings: [p1],
      lines: [line('p1', 'given', '2026-10-02'), prise, report],
      today: '2026-10-12',
    }
    const result = accepted(
      redateDose(input, { lineId: prise.id, givenOn: '2026-10-11', shiftsFollowing: true }),
    )
    expect(result.followed).toEqual([{ from: '2026-10-21', to: '2026-10-21' }])
    const rewritten = applied(input, result.changes).lines.find(({ id }) => id === report.id)
    expect([rewritten?.dueOn, rewritten?.targetOn]).toEqual(['2026-10-18', '2026-10-21'])
    expect(
      accepted(
        redateDose(input, { lineId: prise.id, givenOn: '2026-10-11', shiftsFollowing: false }),
      ).changes,
    ).toHaveLength(1)
  })

  it('G19, #786 : dose du 23 reportée seule au 27 ; le 20, « Fait à une autre date » le 19 coché et la correction vers le 19 font suivre le report, même carnet', () => {
    const report = line('p1', 'postponed', '2026-10-23', null, '2026-10-27')
    const input = { settings: [p1], lines: [...base, report], today: '2026-10-20' }
    const dose = { settingId: 'p1', dueOn: '2026-10-16', dueTime: null }
    const direct = accepted(
      noteDose(input, { due: dose, status: 'given', givenOn: '2026-10-19', shiftsFollowing: true }),
    )
    expect(direct.followed).toEqual([{ from: '2026-10-27', to: '2026-10-27' }])
    const tapped = applied(
      input,
      accepted(
        noteDose(input, {
          due: dose,
          status: 'given',
          givenOn: '2026-10-20',
          shiftsFollowing: false,
        }),
      ).changes,
    )
    const prise = tapped.lines.find(
      ({ status, dueOn }) => status === 'given' && dueOn === '2026-10-16',
    )!
    const result = accepted(
      redateDose(tapped, { lineId: prise.id, givenOn: '2026-10-19', shiftsFollowing: true }),
    )
    expect(result.followed).toEqual(direct.followed)
    const read = (changes: typeof direct.changes, carnet: TreatmentViewInput) => {
      const view = treatmentView(applied(carnet, changes))
      return [keys(view.currentDoses), keys(view.upcoming({ limit: 3 }))]
    }
    expect(read(result.changes, tapped)).toEqual(read(direct.changes, input))
  })

  it('G19, TR-24 : dose du 23 reportée seule au 27 ; le 20, la prise en plus du 12 corrigée au 19, cochée : elle devient la dose du 16 et le report suit', () => {
    const extra = line('p1', 'extra', '2026-10-12')
    const report = line('p1', 'postponed', '2026-10-23', null, '2026-10-27')
    const input = { settings: [p1], lines: [...base, extra, report], today: '2026-10-20' }
    const result = accepted(
      redateDose(input, { lineId: extra.id, givenOn: '2026-10-19', shiftsFollowing: true }),
    )
    expect(result.followed).toEqual([{ from: '2026-10-27', to: '2026-10-27' }])
  })

  it('TR-24 : une prise en plus redatée vise ce que viserait une prise notée ce jour-là', () => {
    const extra = line('p1', 'extra', '2026-10-05')
    const input = { settings: [p1], lines: [...base, extra], today: '2026-10-17' }
    const result = accepted(
      redateDose(input, { lineId: extra.id, givenOn: '2026-10-16', shiftsFollowing: false }),
    )
    const lines = applied(input, result.changes).lines.map(
      ({ status, dueOn }) => `${status} ${dueOn}`,
    )
    expect(lines).toContain('given 2026-10-16')
    expect(lines).not.toContain('extra 2026-10-05')
    const taken = { ...input, lines: [...input.lines, line('p1', 'extra', '2026-10-06')] }
    expect(
      redateDose(taken, { lineId: extra.id, givenOn: '2026-10-06', shiftsFollowing: false }),
    ).toEqual({
      refusal: { reason: 'day-taken' },
    })
  })
})

describe('TR-16, TR-24 bis : une prise de « Choisir les jours » se corrige comme les autres (décision du 2026-10-12)', () => {
  it('dose du 16 renseignée le 25 par « Choisir les jours », ou notée le 16 par « C’est fait » ; corrigée au 17 : même carnet', () => {
    const dose = { settingId: 'p1', dueOn: '2026-10-16', dueTime: null }
    const empty = { settings: [p1], lines: base, today: '2026-10-25' }
    const chosen = applied(
      empty,
      accepted(
        noteDose(empty, {
          due: dose,
          status: 'given',
          givenOn: '2026-10-16',
          shiftsFollowing: false,
        }),
      ).changes,
    )
    const onTime = { ...empty, today: '2026-10-16' }
    const tapped = {
      ...applied(
        onTime,
        accepted(
          noteDose(onTime, {
            due: dose,
            status: 'given',
            givenOn: '2026-10-16',
            shiftsFollowing: false,
          }),
        ).changes,
      ),
      today: '2026-10-25',
    }
    const corrected = (carnet: TreatmentViewInput) => {
      const prise = carnet.lines.find(
        ({ dueOn, status }) => dueOn === '2026-10-16' && status === 'given',
      )!
      const result = accepted(
        redateDose(carnet, { lineId: prise.id, givenOn: '2026-10-17', shiftsFollowing: false }),
      )
      const read = treatmentView(applied(carnet, result.changes))
      return [
        result.offersShift,
        keys(read.currentDoses),
        keys(read.unloggedDoses),
        keys(read.upcoming({ limit: 2 })),
      ]
    }
    expect(corrected(chosen)).toEqual(corrected(tapped))
  })
})

describe('R6, R11 : une correction de date n’efface jamais un oubli (décision du 2026-10-12)', () => {
  it('prise du 2 donnée, dose du 9 à renseigner, dose du 16 oubliée ; le 20, la prise du 2 corrigée au 17 : elle reste la dose du 2, l’oubli du 16 reste, pas de case (Q30)', () => {
    const prise = line('p1', 'given', '2026-10-02')
    const missed = line('p1', 'missed', '2026-10-16')
    const input = { settings: [p1], lines: [prise, missed], today: '2026-10-20' }
    for (const shiftsFollowing of [true, false]) {
      const gesture = { lineId: prise.id, givenOn: '2026-10-17', shiftsFollowing }
      const result = accepted(redateDose(input, gesture))
      expect(result.offersShift).toBe(false)
      const read = treatmentView(applied(input, result.changes))
      expect(read.dueState({ dueOn: '2026-10-02', dueTime: null })).toBe('given')
      expect(read.dueState({ dueOn: '2026-10-16', dueTime: null })).toBe('missed')
      expect(keys(read.unloggedDoses)).toEqual(['2026-10-09'])
      expect(keys(read.upcoming({ limit: 1 }))).toEqual(['2026-10-23'])
    }
  })
})

describe('Q-C1, TR-32 : la correction d’une prise d’une période arrêtée (relecture du pas 3)', () => {
  it.each([true, false])(
    'hebdo, dose du 2 oct. donnée, arrêt le 5, reprise le 12 (première dose le 16) ; le 20, la prise du 2 corrigée au 17, case %s : elle reste la dose du 2, la reprise ne bouge pas',
    (checked) => {
      const first = setting('p1', '2026-10-02', WEEK, [], { stoppedOn: '2026-10-05' })
      const resumed = setting('p2', '2026-10-16', WEEK, [], { startsOn: '2026-10-12' })
      const prise = line('p1', 'given', '2026-10-02')
      const input = { settings: [first, resumed], lines: [prise], today: '2026-10-20' }
      const gesture = { lineId: prise.id, givenOn: '2026-10-17', shiftsFollowing: checked }
      const after = applied(input, accepted(redateDose(input, gesture)).changes)
      expect(after.lines.filter(({ settingId }) => settingId === 'p2')).toEqual([])
      const rewritten = after.lines.find(({ id }) => id === prise.id)
      expect([rewritten?.dueOn, rewritten?.givenOn]).toEqual(['2026-10-02', '2026-10-17'])
      expect(after.lines.map(({ status }) => status)).toEqual(['given'])
      const read = treatmentView(after)
      expect([keys(read.currentDoses), keys(read.unloggedDoses)]).toEqual([['2026-10-16'], []])
      expect(keys(read.upcoming({ limit: 1 }))).toEqual(['2026-10-23'])
    },
  )

  it('R6 : arrêté le 20 sans reprise, la prise du 16 corrigée au 18 : pas de case, aucun décalage écrit', () => {
    const stopped = setting('p1', '2026-10-02', WEEK, [], { stoppedOn: '2026-10-20' })
    const lines = [...base, line('p1', 'given', '2026-10-16')]
    const input = { settings: [stopped], lines, today: '2026-10-22' }
    const gesture = { lineId: lines[2]!.id, givenOn: '2026-10-18', shiftsFollowing: true }
    const result = accepted(redateDose(input, gesture))
    expect([result.offersShift, result.changes.length]).toEqual([false, 1])
  })
})
