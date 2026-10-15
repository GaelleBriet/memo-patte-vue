// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  newSettings,
  play,
  settingsApplied,
  treatmentView,
  type DueReminder,
  type ReminderWindow,
} from '../domain/dose-calendar'
import { DAY, H, line, MONTH, setting, view, WEEK } from './dose-calendar.v2.aides'

const played = (input: Parameters<typeof play>[0], gesture: Parameters<typeof play>[1]) => {
  const result = play(input, gesture)
  if ('refusal' in result) throw new Error('geste refusé')
  return result
}

const WINDOW: ReminderWindow = { count: 60, daysBefore: 3, daysAfter: 3 }

/** `moment jour-visé heure → jour où il sonne [heures du jour]`. */
const shown = (reminders: DueReminder[]) =>
  reminders.map(
    ({ moment, due, on, hours }) =>
      `${moment} ${due.dueOn} ${due.dueTime ?? '-'} → ${on}` +
      (moment === 'before' ? ` [${hours.join(',')}]` : ''),
  )

describe('RA-1 à RA-6 : les rappels lus dans la vue', () => {
  it('RA-1, RA-4, RA-6 : quotidien à 8 h et 20 h, un rappel par heure, ni prévenance ni relance, rien pour la veille à renseigner', () => {
    const p1 = setting('p1', '2026-10-05', DAY, H, { endsOn: '2026-10-07' })
    const read = view([p1], [line('p1', 'given', '2026-10-05', '08:00')], '2026-10-06')
    expect(shown(read.reminders(WINDOW))).toEqual([
      'due 2026-10-06 08:00 → 2026-10-06',
      'due 2026-10-06 20:00 → 2026-10-06',
      'due 2026-10-07 08:00 → 2026-10-07',
      'due 2026-10-07 20:00 → 2026-10-07',
    ])
  })

  it('RA-2, RA-3 : hebdomadaire sans heure, prévenance 3 jours avant, relance 3 jours après', () => {
    const read = view([setting('p1', '2026-10-12', WEEK)], [], '2026-10-06')
    expect(shown(read.reminders({ ...WINDOW, count: 1 })).slice(0, 9)).toEqual([
      'due 2026-10-12 - → 2026-10-12',
      'before 2026-10-12 - → 2026-10-09 []',
      'overdue 2026-10-12 - → 2026-10-15',
      'due 2026-10-19 - → 2026-10-19',
      'before 2026-10-19 - → 2026-10-16 []',
      'overdue 2026-10-19 - → 2026-10-22',
      'due 2026-10-26 - → 2026-10-26',
      'before 2026-10-26 - → 2026-10-23 []',
      'overdue 2026-10-26 - → 2026-10-29',
    ])
  })

  it('RA-5 : à plusieurs heures, une prévenance à la première heure, une relance si toutes les heures sont encore dues', () => {
    const p1 = setting('p1', '2026-10-05', WEEK, ['20:00', '08:00'], { endsOn: '2026-10-12' })
    expect(shown(view([p1], [], '2026-10-06').reminders(WINDOW))).toEqual([
      'due 2026-10-05 08:00 → 2026-10-05',
      'due 2026-10-05 20:00 → 2026-10-05',
      'before 2026-10-05 08:00 → 2026-10-02 [08:00,20:00]',
      'overdue 2026-10-05 08:00 → 2026-10-08',
      'due 2026-10-12 08:00 → 2026-10-12',
      'due 2026-10-12 20:00 → 2026-10-12',
      'before 2026-10-12 08:00 → 2026-10-09 [08:00,20:00]',
      'overdue 2026-10-12 08:00 → 2026-10-15',
    ])
    const halfDone = view([p1], [line('p1', 'given', '2026-10-05', '08:00')], '2026-10-06')
    expect(shown(halfDone.reminders(WINDOW)).filter((each) => each.includes('2026-10-05'))).toEqual(
      ['due 2026-10-05 20:00 → 2026-10-05', 'before 2026-10-05 20:00 → 2026-10-02 [20:00]'],
    )
  })

  describe('RA-3, RA-5 : la relance compare aux heures de la journée que montre la fiche (R7, #814)', () => {
    const p1 = setting('p1', '2026-10-05', WEEK, H)
    const ofDay = (day: string, reminders: DueReminder[]) =>
      shown(reminders).filter((each) => each.split(' ')[1] === day)

    it('Luna : 8 h donnée le 5, 20 h reportée au jeudi 8, rien noté le 8 : relance le 11', () => {
      const lines = [
        line('p1', 'given', '2026-10-05', '08:00'),
        line('p1', 'postponed', '2026-10-05', '20:00', '2026-10-08'),
      ]
      expect(ofDay('2026-10-08', view([p1], lines, '2026-10-06').reminders(WINDOW))).toEqual([
        'due 2026-10-08 20:00 → 2026-10-08',
        'before 2026-10-08 20:00 → 2026-10-05 [20:00]',
        'overdue 2026-10-08 20:00 → 2026-10-11',
      ])
    })

    it('la journée d’arrivée notée ne relance pas', () => {
      const lines = [
        line('p1', 'given', '2026-10-05', '08:00'),
        line('p1', 'postponed', '2026-10-05', '20:00', '2026-10-08'),
        line('p1', 'given', '2026-10-08', '20:00'),
      ]
      expect(ofDay('2026-10-08', view([p1], lines, '2026-10-09').reminders(WINDOW))).toEqual([])
    })

    it('journée entière reportée : les deux heures arrivent, relance tant qu’aucune n’est notée', () => {
      const report = line('p1', 'postponed', '2026-10-05', '08:00', '2026-10-08')
      expect(
        ofDay('2026-10-08', view([p1], [report], '2026-10-06').reminders(WINDOW)).filter((each) =>
          each.startsWith('overdue'),
        ),
      ).toEqual(['overdue 2026-10-08 08:00 → 2026-10-11'])
      const morning = line('p1', 'given', '2026-10-08', '08:00')
      expect(
        ofDay('2026-10-08', view([p1], [report, morning], '2026-10-09').reminders(WINDOW)),
      ).toEqual([
        'due 2026-10-08 20:00 → 2026-10-08',
        'before 2026-10-08 20:00 → 2026-10-05 [20:00]',
      ])
    })

    it('jour d’origine : 20 h reportée au 17 puis 8 h ajoutée, la journée du 12 reste reportée : aucune relance le 12, rappel le 17 à 20 h (décision du 15 octobre 2026)', () => {
      const week = { value: 1, unit: 'week' } as const
      const first = {
        settings: [setting('p1', '2026-10-05', week, ['20:00'])],
        lines: [],
        today: '2026-10-05',
      }
      const noted = applied(
        first,
        played(first, {
          kind: 'note',
          due: { settingId: 'p1', dueOn: '2026-10-05', dueTime: '20:00' },
          status: 'given',
          givenOn: '2026-10-05',
          shiftsFollowing: false,
        }).changes,
      )
      const moved = { ...noted, today: '2026-10-06' }
      const afterMove = applied(
        moved,
        played(moved, {
          kind: 'move',
          due: { settingId: 'p1', dueOn: '2026-10-12', dueTime: '20:00' },
          to: '2026-10-17',
          shiftsFollowing: false,
        }).changes,
      )
      const edited = { ...afterMove, today: '2026-10-07' }
      const proposal = newSettings(edited, {
        frequency: week,
        times: ['08:00', '20:00'],
        endsOn: null,
      })
      if (!('plan' in proposal)) throw new Error('plan attendu')
      const after = settingsApplied(edited, proposal.plan)
      const reminders = shown(treatmentView(after).reminders(WINDOW))
      expect(reminders.filter((each) => each.includes(' 2026-10-12'))).toEqual([])
      expect(reminders.filter((each) => each.startsWith('due 2026-10-17'))).toEqual([
        'due 2026-10-17 20:00 → 2026-10-17',
      ])
    })
  })

  it('RA-4 : tous les 4 jours, prévenance après l’échéance d’avant, relance avant la suivante', () => {
    const read = view([setting('p1', '2026-10-10', { value: 4, unit: 'day' })], [], '2026-10-06')
    expect(shown(read.reminders({ ...WINDOW, count: 1 })).slice(0, 6)).toEqual([
      'due 2026-10-10 - → 2026-10-10',
      'before 2026-10-10 - → 2026-10-07 []',
      'overdue 2026-10-10 - → 2026-10-13',
      'due 2026-10-14 - → 2026-10-14',
      'before 2026-10-14 - → 2026-10-11 []',
      'overdue 2026-10-14 - → 2026-10-17',
    ])
  })

  it('RA-4 : tous les 3 jours, le rappel du jour seul, ni prévenance ni relance', () => {
    const read = view([setting('p1', '2026-10-10', { value: 3, unit: 'day' })], [], '2026-10-06')
    expect(shown(read.reminders({ ...WINDOW, count: 3 })).slice(0, 3)).toEqual([
      'due 2026-10-10 - → 2026-10-10',
      'due 2026-10-13 - → 2026-10-13',
      'due 2026-10-16 - → 2026-10-16',
    ])
    expect(read.reminders(WINDOW).every(({ moment }) => moment === 'due')).toBe(true)
  })

  it('RA-4 : un report qui arrive deux jours avant la suivante retire prévenance et relance entre elles', () => {
    const p1 = setting('p1', '2026-10-05', WEEK)
    const report = line('p1', 'postponed', '2026-10-05', null, '2026-10-10')
    expect(
      shown(view([p1], [report], '2026-10-06').reminders({ ...WINDOW, count: 2 })).slice(0, 7),
    ).toEqual([
      'due 2026-10-10 - → 2026-10-10',
      'before 2026-10-10 - → 2026-10-07 []',
      'due 2026-10-12 - → 2026-10-12',
      'overdue 2026-10-12 - → 2026-10-15',
      'due 2026-10-19 - → 2026-10-19',
      'before 2026-10-19 - → 2026-10-16 []',
      'overdue 2026-10-19 - → 2026-10-22',
    ])
  })

  it('RA-6 : aucun rappel pour une dose à renseigner, la dose du moment seule', () => {
    const p1 = setting('p1', '2026-10-01', DAY, ['20:00'], { endsOn: '2026-10-08' })
    expect(shown(view([p1], [], '2026-10-06').reminders(WINDOW))).toEqual([
      'due 2026-10-06 20:00 → 2026-10-06',
      'due 2026-10-07 20:00 → 2026-10-07',
      'due 2026-10-08 20:00 → 2026-10-08',
    ])
  })

  it('RA-6 : après la date de fin, la dernière dose non notée garde sa relance ; une plus ancienne, rien', () => {
    const p1 = setting('p1', '2026-10-12', WEEK, [], { endsOn: '2026-10-19' })
    expect(shown(view([p1], [], '2026-10-20').reminders(WINDOW))).toEqual([
      'due 2026-10-19 - → 2026-10-19',
      'before 2026-10-19 - → 2026-10-16 []',
      'overdue 2026-10-19 - → 2026-10-22',
    ])
    const lastGiven = [line('p1', 'given', '2026-10-19')]
    expect(view([p1], lastGiven, '2026-10-20').reminders(WINDOW)).toEqual([])
  })

  it('RA-6 : aucun rappel pour un traitement arrêté', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { stoppedOn: '2026-10-05' })
    expect(view([p1], [], '2026-10-06').reminders(WINDOW)).toEqual([])
  })

  it('RA-11 : mensuel sans fin, les échéances au-delà de 400 jours sont lues jusqu’au nombre demandé', () => {
    const read = view([setting('p1', '2026-10-31', MONTH)], [], '2026-10-13')
    const dues = read.reminders({ ...WINDOW, count: 20 }).filter(({ moment }) => moment === 'due')
    expect(dues).toHaveLength(23)
    expect(dues.at(-1)!.due.dueOn).toBe('2028-08-31')
    expect(dues[3]!.due.dueOn).toBe('2027-01-31')
    expect(dues[4]!.due.dueOn).toBe('2027-02-28')
  })

  it('RA-11 : après un réglage « tous les 365 mois », quatre heures par jour se lisent sans construire des siècles de calendrier', () => {
    const p1 = setting('p1', '2025-01-01', { value: 365, unit: 'month' })
    const p2 = setting('p2', '2026-10-01', DAY, ['06:00', '12:00', '18:00', '23:00'])
    const read = view([p1, p2], [], '2026-10-13')
    const started = performance.now()
    const reminders = read.reminders(WINDOW)
    expect(performance.now() - started).toBeLessThan(1000)
    expect(reminders).toHaveLength(69)
    expect(reminders.every(({ moment, due }) => moment === 'due' && due.settingId === 'p2')).toBe(
      true,
    )
    expect(shown(reminders).slice(0, 2)).toEqual([
      'due 2026-10-13 06:00 → 2026-10-13',
      'due 2026-10-13 12:00 → 2026-10-13',
    ])
    expect(shown(reminders).at(-1)).toBe('due 2026-10-30 06:00 → 2026-10-30')
  })
})

describe('RA-19 : une échéance notée retire sa notification du volet', () => {
  const p1 = setting('p1', '2026-10-05', DAY, H)
  const read = view(
    [p1],
    [
      line('p1', 'given', '2026-10-05', '08:00'),
      line('p1', 'missed', '2026-10-05', '20:00'),
      line('p1', 'postponed', '2026-10-06', '08:00', '2026-10-07'),
    ],
    '2026-10-07',
  )

  it('donnée ou oubliée : notée ; à donner ou reportée : non', () => {
    expect(read.isNoted('2026-10-05', '08:00')).toBe(true)
    expect(read.isNoted('2026-10-05', '20:00')).toBe(true)
    expect(read.isNoted('2026-10-06', '08:00')).toBe(false)
    expect(read.isNoted('2026-10-06', '20:00')).toBe(false)
  })

  it('une clé sans heure vaut pour toute échéance notée de sa journée', () => {
    expect(read.isNoted('2026-10-05', null)).toBe(true)
    expect(read.isNoted('2026-10-06', null)).toBe(false)
  })

  it('arrêté le jour d’une échéance déjà donnée : sortie du calendrier, elle reste notée', () => {
    const p1 = setting('p1', '2026-10-01', { value: 3, unit: 'day' }, H, {
      stoppedOn: '2026-10-04',
    })
    const stopped = view([p1], [line('p1', 'given', '2026-10-04', '08:00')], '2026-10-04')
    expect(stopped.dueState({ dueOn: '2026-10-04', dueTime: '08:00' })).toBe('removed')
    expect(stopped.isNoted('2026-10-04', '08:00')).toBe(true)
    expect(stopped.isNoted('2026-10-04', '20:00')).toBe(false)
  })

  it('couverte par une prise d’une autre heure : notée', () => {
    const p1 = setting('p1', '2026-03-08', WEEK, ['08:00', '14:00', '20:00'])
    const p2 = setting('p2', '2026-03-08', DAY, H)
    const given = (dueTime: string) => ({
      ...line('p1', 'given', '2026-03-08', dueTime),
      givenOn: '2026-03-02',
    })
    const afternoon = given('14:00')
    const read = view([p1, p2], [given('08:00'), afternoon], '2026-03-08')
    expect(read.slots('2026-03-08', '2026-03-08').at(-1)).toEqual({
      due: { settingId: 'p2', dueOn: '2026-03-08', dueTime: '20:00' },
      state: 'covered',
      by: afternoon,
    })
    expect(read.isNoted('2026-03-08', '20:00')).toBe(true)
    expect(view([p1, p2], [given('08:00')], '2026-03-08').isNoted('2026-03-08', '20:00')).toBe(
      false,
    )
  })

  it('une prise sans effet sur une échéance encore à donner ne la note pas', () => {
    const p1 = setting('p1', '2026-03-17', { value: 2, unit: 'week' }, H, {
      stoppedOn: '2026-03-22',
    })
    const p2 = setting('p2', '2026-03-28', DAY, ['20:00'], { startsOn: '2026-03-26' })
    const report = line('p1', 'postponed', '2026-03-17', '08:00', '2026-04-19')
    const early = { ...line('p1', 'given', '2026-04-19', '20:00'), givenOn: '2026-03-16' }
    const read = view([p1, p2], [report, early], '2026-03-26')
    expect(read.history.at(-1)!.effect.kind).toBe('idle')
    expect(read.dueState({ dueOn: '2026-04-19', dueTime: '20:00' })).toBe('pending')
    expect(read.isNoted('2026-04-19', '20:00')).toBe(false)
  })
})
