// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  newSettings,
  play,
  settingsApplied,
  treatmentView,
  type Due,
  type Gesture,
  type GestureOutcome,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { DAY, H, line, setting, WEEK } from './dose-calendar.v2.aides'

const accepted = (result: ReturnType<typeof play>): GestureOutcome => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return result
}

let written = 0

/** Le geste joué ; les lignes créées reçoivent un identifiant unique, comme dans la base. */
function played(input: TreatmentViewInput, gesture: Gesture): TreatmentViewInput {
  const known = new Set(input.lines.map(({ id }) => id))
  const after = applied(input, accepted(play(input, gesture)).changes)
  return {
    ...after,
    lines: after.lines.map((other) =>
      known.has(other.id) ? other : { ...other, id: `w${(written += 1)}` },
    ),
  }
}

const calendarOf = (carnet: TreatmentViewInput, from: string, to: string) =>
  treatmentView(carnet)
    .slots(from, to)
    .map(({ due, state }) => `${due.dueOn} ${due.dueTime ?? ''} ${state}`)

/**
 * « Fait à une autre date » au jour J, et « C'est fait » aujourd'hui puis « Changer la date » de cette
 * prise vers J : la case proposée des deux côtés, et, cochée, le même calendrier.
 */
function bothWays(input: TreatmentViewInput, due: Due, givenOn: string) {
  const note = { kind: 'note', due, status: 'given' } as const
  const noted = accepted(play(input, { ...note, givenOn, shiftsFollowing: true }))
  const afterTap = played(input, { ...note, givenOn: input.today, shiftsFollowing: false })
  const prise = afterTap.lines.find(
    (other) =>
      other.status === 'given' &&
      other.dueOn === due.dueOn &&
      other.dueTime === due.dueTime &&
      other.givenOn === input.today,
  )!
  const redated = accepted(
    play(afterTap, { kind: 'redate', lineId: prise.id, givenOn, shiftsFollowing: true }),
  )
  const horizon = { from: '2026-01-01', to: '2026-06-30' }
  return {
    offers: [noted.offersShift, redated.offersShift],
    sameCalendar:
      JSON.stringify(calendarOf(applied(input, noted.changes), horizon.from, horizon.to)) ===
      JSON.stringify(calendarOf(applied(afterTap, redated.changes), horizon.from, horizon.to)),
  }
}

describe('graines de la famille « case de Changer la date » (#1253, #1255, #1256), chaînes réduites', () => {
  it('graine 420000277 : la journée du 8 avril garde le décalage d’un report devenu sans effet', () => {
    // Tous les jours à 20 h du 3 avril au 16 mai ; le 7, la dose du 8 reportée au 15 mai avec
    // « Décaler aussi », puis « Modifier » au même rythme, première dose le 8 : le report est sans
    // effet, son décalage reste ; le 12, la dose du 8 est la dose du moment, en retard.
    const s1 = setting('s1', '2026-04-03', DAY, ['20:00'], { endsOn: '2026-05-16' })
    const dose8 = { settingId: 's1', dueOn: '2026-04-08', dueTime: '20:00' }
    const le7 = played(
      { settings: [s1], lines: [], today: '2026-04-07' },
      { kind: 'move', due: dose8, to: '2026-05-15', shiftsFollowing: true },
    )
    const plan = newSettings(le7, {
      frequency: DAY,
      times: ['20:00'],
      endsOn: '2026-05-16',
      firstDueOn: '2026-04-08',
    })
    if (!('plan' in plan)) throw new Error(`pas de plan : ${JSON.stringify(plan)}`)
    const le12 = { ...settingsApplied(le7, plan.plan), today: '2026-04-12' }
    const view = treatmentView(le12)
    const [due] = view.currentDoses

    expect(due).toMatchObject({ dueOn: '2026-04-08', dueTime: '20:00' })
    expect(view.history.map(({ effect }) => effect.kind)).toEqual(['idle', 'shifts'])
    expect(bothWays(le12, due!, '2026-04-09')).toEqual({ offers: [true, true], sameCalendar: true })
  })

  it('graine 410000881 : la journée du 9 mars porte le décalage du report de 18 h', () => {
    // Tous les jours à 6, 12, 18 et 23 h du 9 mars au 21 avril ; 6 h du 9 donnée en avance le 7 ;
    // 18 h du 9 reportée au 5 avril avec « Décaler aussi » ; le 13, 12 h du 9 est la dose du moment.
    const s1 = setting('s1', '2026-03-09', DAY, ['06:00', '12:00', '18:00', '23:00'], {
      endsOn: '2026-04-21',
    })
    const lines = [
      { ...line('s1', 'given', '2026-03-09', '06:00'), givenOn: '2026-03-07' },
      line('s1', 'postponed', '2026-03-09', '18:00', '2026-04-05'),
      line('s1', 'shift', '2026-03-09', '18:00', '2026-04-05'),
    ]
    const le13: TreatmentViewInput = { settings: [s1], lines, today: '2026-03-13' }
    const due = { settingId: 's1', dueOn: '2026-03-09', dueTime: '12:00' }

    expect(treatmentView(le13).currentDoses[0]).toEqual(due)
    expect(bothWays(le13, due, '2026-03-10')).toEqual({ offers: [true, true], sameCalendar: true })
  })

  it('graine 450000634 : après « Supprimer » la prise du 14 avril à 8 h, sa journée porte le décalage du report de 14 h', () => {
    // Tous les 3 jours à 8, 14 et 20 h depuis le 3 avril ; la journée du 12 reportée au 14 avec
    // « Décaler aussi » ; 14 h du 14 reportée au 1er mai avec « Décaler aussi » ; 8 h du 14 donnée le
    // 16 ; le 22, « Supprimer » cette prise : 8 h du 14 redevient la dose du moment, en retard.
    const s1 = setting('s1', '2026-04-03', { value: 3, unit: 'day' }, ['08:00', '14:00', '20:00'])
    const prise = { ...line('s1', 'given', '2026-04-14', '08:00'), givenOn: '2026-04-16' }
    const lines = [
      line('s1', 'postponed', '2026-04-12', '08:00', '2026-04-14'),
      line('s1', 'shift', '2026-04-12', '08:00', '2026-04-14'),
      line('s1', 'postponed', '2026-04-14', '14:00', '2026-05-01'),
      line('s1', 'shift', '2026-04-14', '14:00', '2026-05-01'),
      prise,
    ]
    const le22 = played(
      { settings: [s1], lines, today: '2026-04-22' },
      {
        kind: 'remove',
        lineId: prise.id,
      },
    )
    const due = { settingId: 's1', dueOn: '2026-04-14', dueTime: '08:00' }

    expect(treatmentView(le22).currentDoses[0]).toEqual(due)
    expect(bothWays(le22, due, '2026-04-20')).toEqual({ offers: [true, true], sameCalendar: true })
  })
})

describe('la case « Décaler aussi » : une seule condition pour « Fait à une autre date » et « Changer la date » (R6, Q38)', () => {
  const milbemax = setting('p1', '2026-10-02', WEEK)
  const weekly = (lines: TreatmentViewInput['lines'], today: string): TreatmentViewInput => ({
    settings: [milbemax],
    lines,
    today,
  })
  const friday = (dueOn: string): Due => ({ settingId: 'p1', dueOn, dueTime: null })

  it('dose du moment en retard : proposée des deux côtés', () => {
    // Chaque vendredi depuis le 2 oct., 2 et 9 donnés ; le 20, la dose du 16 est en retard ; au 18.
    const carnet = weekly(
      [line('p1', 'given', '2026-10-02'), line('p1', 'given', '2026-10-09')],
      '2026-10-20',
    )
    expect(bothWays(carnet, friday('2026-10-16'), '2026-10-18')).toEqual({
      offers: [true, true],
      sameCalendar: true,
    })
  })

  it('prise en avance : la dose du 23 donnée le 20, proposée des deux côtés', () => {
    const carnet = weekly(
      [
        line('p1', 'given', '2026-10-02'),
        line('p1', 'given', '2026-10-09'),
        line('p1', 'given', '2026-10-16'),
      ],
      '2026-10-21',
    )
    expect(bothWays(carnet, friday('2026-10-23'), '2026-10-20')).toEqual({
      offers: [true, true],
      sameCalendar: true,
    })
  })

  it('dose déjà non renseignée au jour de la nouvelle date : jamais proposée', () => {
    // Le 25, rien depuis le 9 : la dose du 16 donnée le 24, quand la dose du 23 est déjà tombée.
    const carnet = weekly(
      [line('p1', 'given', '2026-10-02'), line('p1', 'given', '2026-10-09')],
      '2026-10-25',
    )
    expect(bothWays(carnet, friday('2026-10-16'), '2026-10-24')).toEqual({
      offers: [false, false],
      sameCalendar: true,
    })
  })

  it('la case ferait disparaître une dose passée sans prise (Q44) : jamais proposée', () => {
    // Le 24, rien depuis le 9 : la dose du 16 donnée le 17 ; cochée, la suite repartirait du 17 (24,
    // 31) et la dose du 23, en retard, disparaîtrait.
    const carnet = weekly(
      [line('p1', 'given', '2026-10-02'), line('p1', 'given', '2026-10-09')],
      '2026-10-24',
    )
    expect(bothWays(carnet, friday('2026-10-16'), '2026-10-17').offers).toEqual([false, false])
  })

  it('dose plus lointaine que la dose du moment (#1242) : proposée des deux côtés', () => {
    // Le 20, la dose du 16 en retard ; la dose du 23, à venir au 18, donnée au 18.
    const carnet = weekly(
      [line('p1', 'given', '2026-10-02'), line('p1', 'given', '2026-10-09')],
      '2026-10-20',
    )
    expect(bothWays(carnet, friday('2026-10-23'), '2026-10-18')).toEqual({
      offers: [true, true],
      sameCalendar: true,
    })
  })

  it('plusieurs heures : seulement à la dernière heure encore sans prise de la journée', () => {
    // Tous les 3 jours à 8 h et 20 h depuis le 2 mars ; le 7, la journée du 5 en retard ; au 6.
    const metacam = setting('s1', '2026-03-02', { value: 3, unit: 'day' }, H)
    const both = { settings: [metacam], lines: [], today: '2026-03-07' }
    const at8 = { settingId: 's1', dueOn: '2026-03-05', dueTime: '08:00' }
    const at20 = { settingId: 's1', dueOn: '2026-03-05', dueTime: '20:00' }
    const lines = [
      line('s1', 'given', '2026-03-02', '08:00'),
      line('s1', 'given', '2026-03-02', '20:00'),
    ]
    expect(bothWays({ ...both, lines }, at8, '2026-03-06').offers).toEqual([false, false])
    const after8 = [...lines, line('s1', 'given', '2026-03-05', '08:00')]
    expect(bothWays({ ...both, lines: after8 }, at20, '2026-03-06')).toEqual({
      offers: [true, true],
      sameCalendar: true,
    })
  })

  it('journée qui porte le décalage d’une autre heure (#1255) : proposée des deux côtés', () => {
    const metacam = setting('s1', '2026-03-09', DAY, H)
    const lines = [
      line('s1', 'postponed', '2026-03-09', '20:00', '2026-04-05'),
      line('s1', 'shift', '2026-03-09', '20:00', '2026-04-05'),
    ]
    const carnet = { settings: [metacam], lines, today: '2026-03-13' }
    const due = { settingId: 's1', dueOn: '2026-03-09', dueTime: '08:00' }
    expect(bothWays(carnet, due, '2026-03-10')).toEqual({
      offers: [true, true],
      sameCalendar: true,
    })
  })

  it('après « Supprimer » une prise plus récente : la dose redevenue du moment, proposée des deux côtés', () => {
    const lines = [
      line('p1', 'given', '2026-10-02'),
      line('p1', 'given', '2026-10-09'),
      line('p1', 'given', '2026-10-16'),
    ]
    const removed = played(weekly(lines, '2026-10-20'), { kind: 'remove', lineId: lines[2]!.id })
    expect(bothWays(removed, friday('2026-10-16'), '2026-10-19')).toEqual({
      offers: [true, true],
      sameCalendar: true,
    })
  })
})
