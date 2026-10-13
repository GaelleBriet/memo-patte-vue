// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { noteDose, removalRefusal } from '../domain/dose-calendar'
import type { Frequency, Line } from '../domain/dose-calendar/types'
import * as reference from './dose-calendar.reference.aides'
import { DAY, H, keys, line, MONTH, setting, TWO_DAYS, view } from './dose-calendar.v2.aides'

const STOP = '2026-10-13'

const effectsOf = (read: ReturnType<typeof view>, lines: Line[]) =>
  lines.map((each) => read.history.find(({ line: read }) => read.id === each.id)!.effect)

describe('TR-30, #819 : les prises du jour de l’arrêt, données avant l’arrêt, restent comptées', () => {
  describe('« Test » tous les 2 jours à 8 h et 20 h dès le 13 oct. ; 13 et 15 donnés le 13 ; « Arrêter » le 13', () => {
    const test = setting('p1', STOP, TWO_DAYS, H, { stoppedOn: STOP })
    const ofDay13 = H.map((hour) => line('p1', 'given', STOP, hour))
    const ofDay15 = H.map((hour) => ({ ...line('p1', 'given', '2026-10-15', hour), givenOn: STOP }))
    const read = view([test], [...ofDay13, ...ofDay15], STOP)

    it('les deux prises du 13 couvrent leurs doses', () => {
      expect(effectsOf(read, ofDay13)).toEqual([
        { kind: 'covers', key: '2026-10-13 08:00' },
        { kind: 'covers', key: '2026-10-13 20:00' },
      ])
    })

    it('les deux prises du 15, après l’arrêt, restent sans effet', () => {
      expect(effectsOf(read, ofDay15)).toEqual([
        { kind: 'idle', reason: 'nothing-to-cover' },
        { kind: 'idle', reason: 'nothing-to-cover' },
      ])
    })

    it('« Arrêté le 13 oct. », rien à renseigner', () => {
      expect([read.phase, read.finished, read.stoppedBeforeFirstDose, read.endedOn]).toEqual([
        'stopped',
        true,
        false,
        STOP,
      ])
      expect(read.unloggedDoses).toEqual([])
    })
  })

  it.each<[string, string, Frequency]>([
    ['ouvert le jour de l’arrêt, tous les 2 jours', STOP, TWO_DAYS],
    ['tous les jours depuis le 10', '2026-10-10', DAY],
    ['tous les 2 jours depuis le 11', '2026-10-11', TWO_DAYS],
  ])('%s : le jour de l’arrêt se lit de la même façon', (_, firstDueOn, frequency) => {
    const stopped = setting('p1', firstDueOn, frequency, H, { stoppedOn: STOP })
    const ofDay13 = H.map((hour) => line('p1', 'given', STOP, hour))
    expect(effectsOf(view([stopped], ofDay13, STOP), ofDay13)).toEqual([
      { kind: 'covers', key: '2026-10-13 08:00' },
      { kind: 'covers', key: '2026-10-13 20:00' },
    ])
  })

  it('tous les jours depuis le 10, 8 h du 13 donnée, arrêt le 13 : 20 h est retirée, pas à renseigner', () => {
    const daily = setting('p1', '2026-10-10', DAY, H, { stoppedOn: STOP })
    const before = ['2026-10-10', '2026-10-11', '2026-10-12'].flatMap((day) =>
      H.map((hour) => line('p1', 'given', day, hour)),
    )
    const morning = line('p1', 'given', STOP, '08:00')
    const read = view([daily], [...before, morning], STOP)
    expect(effectsOf(read, [morning])).toEqual([{ kind: 'covers', key: '2026-10-13 08:00' }])
    expect(read.dueState({ dueOn: STOP, dueTime: '20:00' })).toBe('removed')
    expect([read.finished, keys(read.unloggedDoses)]).toEqual([true, []])
  })

  describe('tous les 2 jours à 8 h dès le 10 ; dose du 12 reportée au 13 ; arrêt le 13', () => {
    const stopped = setting('p1', '2026-10-10', TWO_DAYS, ['08:00'], { stoppedOn: STOP })
    const first = line('p1', 'given', '2026-10-10', '08:00')
    const report = line('p1', 'postponed', '2026-10-12', '08:00', STOP)

    it('donnée le 13 avant l’arrêt : la prise couvre la dose arrivée, le report arrive le 13', () => {
      const given = line('p1', 'given', STOP, '08:00')
      const read = view([stopped], [first, report, given], STOP)
      expect(effectsOf(read, [report, given])).toEqual([
        { kind: 'moves', keys: ['2026-10-12 08:00'], arrival: STOP },
        { kind: 'covers', key: '2026-10-13 08:00' },
      ])
    })

    it('sans prise le 13 : la dose arrivée est retirée par l’arrêt, rien à renseigner', () => {
      const read = view([stopped], [first, report], STOP)
      expect([read.finished, keys(read.unloggedDoses)]).toEqual([true, []])
      expect(read.dueState({ dueOn: STOP, dueTime: '08:00' })).toBe('removed')
    })
  })

  it('graine 2001000538 : arrêté le 2 avr., repris le 2 à 8, 14 et 20 h, 20 h du 2 donnée de chaque côté, remplacé le 2 par une posologie dès le 3 : le 2 à 20 h n’est couvert qu’une fois', () => {
    const hours = ['08:00', '14:00', '20:00']
    const stopped = setting('p1', '2026-03-30', DAY, ['20:00'], { stoppedOn: '2026-04-02' })
    const resumed = setting('p2', '2026-04-02', DAY, hours)
    const replacing = setting('p3', '2026-04-03', DAY, hours, { startsOn: '2026-04-02' })
    const lines = [
      line('p1', 'given', '2026-04-02', '20:00'),
      line('p2', 'given', '2026-04-02', '20:00'),
    ]
    const read = view([stopped, resumed, replacing], lines, '2026-04-02')
    expect(effectsOf(read, lines).filter(({ kind }) => kind === 'covers')).toEqual([
      { kind: 'covers', key: '2026-04-02 20:00' },
    ])
  })

  it('#780 : toutes les 2 semaines à 20 h, dose du 13 avr. reportée au 14, toutes les 6 semaines dès le 14, arrêté le 14 : le report reste verrouillé', () => {
    const metacam = setting('m1', '2026-03-30', { value: 2, unit: 'week' }, ['20:00'])
    const report = line('m1', 'postponed', '2026-04-13', '20:00', '2026-04-14')
    const sixWeeks = setting('m2', '2026-04-14', { value: 6, unit: 'week' }, ['06:00', '20:00'], {
      startsOn: '2026-04-02',
    })
    const lines = [line('m1', 'given', '2026-03-30', '20:00'), report]
    const stopped = { ...sixWeeks, stoppedOn: '2026-04-14' }
    expect([
      removalRefusal({ settings: [metacam, sixWeeks], lines, today: '2026-04-14' }, report.id),
      removalRefusal({ settings: [metacam, stopped], lines, today: '2026-04-14' }, report.id),
    ]).toEqual([{ reason: 'not-movable' }, { reason: 'not-movable' }])
  })

  it('ouvert le 13, première dose le 15, arrêté le 13 sans prise : « Arrêté avant la première prise »', () => {
    const later = setting('p1', '2026-10-15', TWO_DAYS, H, { startsOn: STOP, stoppedOn: STOP })
    const read = view([later], [], STOP)
    expect([read.stoppedBeforeFirstDose, read.endedOn]).toEqual([true, STOP])
  })

  describe('mensuel sans heure, dose du 13 oct. donnée le 13, « Arrêter » le 13, « Reprendre »', () => {
    const monthly = setting('p1', '2026-09-13', MONTH, [], { stoppedOn: STOP })
    const given = line('p1', 'given', STOP)

    it.each<[string, string, string, Frequency]>([
      ['le 13, première dose le 13 nov.', STOP, '2026-11-13', MONTH],
      ['le 13, tous les jours dès le 14', STOP, '2026-10-14', DAY],
      ['le 14, première dose le 13 nov.', '2026-10-14', '2026-11-13', MONTH],
    ])('%s : la prise du 13 oct. couvre sa dose', (_, startsOn, firstDueOn, frequency) => {
      const resumed = setting('p2', firstDueOn, frequency, [], { startsOn })
      const read = view([monthly, resumed], [given], STOP)
      expect(effectsOf(read, [given])).toEqual([{ kind: 'covers', key: STOP }])
      expect(keys([read.nextDue!])).toEqual([firstDueOn])
    })
  })

  it('8 h, 14 h et 20 h du 8 données, arrêt le 8, reprise le 8, première dose le 9 : les trois prises couvrent leurs doses', () => {
    const hours = ['08:00', '14:00', '20:00']
    const stopped = setting('p1', '2026-10-05', DAY, hours, { stoppedOn: '2026-10-08' })
    const resumed = setting('p2', '2026-10-09', DAY, hours, { startsOn: '2026-10-08' })
    const ofDay8 = hours.map((hour) => line('p1', 'given', '2026-10-08', hour))
    expect(effectsOf(view([stopped, resumed], ofDay8, '2026-10-08'), ofDay8)).toEqual([
      { kind: 'covers', key: '2026-10-08 08:00' },
      { kind: 'covers', key: '2026-10-08 14:00' },
      { kind: 'covers', key: '2026-10-08 20:00' },
    ])
  })

  describe('tous les jours, prises données jusqu’au 2 avr. ; arrêté le 2, repris le 2 dès le 3, arrêté de nouveau le 2, repris le 2 dès le 2', () => {
    const twice = (hours: string[]) => {
      const days = ['2026-03-30', '2026-03-31', '2026-04-01', '2026-04-02']
      const settings = [
        setting('p1', days[0]!, DAY, hours, { stoppedOn: '2026-04-02' }),
        setting('p2', '2026-04-03', DAY, hours, {
          startsOn: '2026-04-02',
          stoppedOn: '2026-04-02',
        }),
        setting('p3', '2026-04-02', DAY, hours),
      ]
      const lines = days.flatMap((day) => hours.map((hour) => line('p1', 'given', day, hour)))
      return { settings, lines, today: '2026-04-02' }
    }

    it.each([
      ['à 20 h', ['20:00']],
      ['à 8 h et 20 h', H],
    ])('%s : « C’est fait » sur la dose de 20 h du 2, déjà couverte, est refusé', (_, hours) => {
      const due = { settingId: 'p3', dueOn: '2026-04-02', dueTime: '20:00' }
      const gesture = {
        due,
        status: 'given' as const,
        givenOn: '2026-04-02',
        shiftsFollowing: false,
      }
      expect(noteDose(twice(hours), gesture)).toEqual({ refusal: { reason: 'later-dose' } })
    })
  })

  describe('R8, Q-G3 : Milo, prises données jusqu’au 8 ; arrêt le 8, reprise le 8 avec sa première dose le 8 (décision du 2026-10-13)', () => {
    const before = ['2026-10-05', '2026-10-06', '2026-10-07']
    const milo = (hours: string[], resumedAt: string[], given: string[] = hours) => {
      const settings = [
        setting('p1', '2026-10-05', DAY, hours, { stoppedOn: '2026-10-08' }),
        setting('p2', '2026-10-08', DAY, resumedAt),
      ]
      const earlier = before.flatMap((day) => hours.map((hour) => line('p1', 'given', day, hour)))
      const ofDay8 = given.map((hour) => line('p1', 'given', '2026-10-08', hour))
      return { settings, lines: [...earlier, ...ofDay8], ofDay8 }
    }

    it.each<[string, string[], string[], string[], string]>([
      [
        'une dose à 8 h donnée, reprise à 20 h',
        ['08:00'],
        ['20:00'],
        ['08:00'],
        '2026-10-09 20:00',
      ],
      ['8 h et 20 h données, reprise à 9 h et 21 h', H, ['09:00', '21:00'], H, '2026-10-09 09:00'],
      [
        '8 h donnée, reprise à 9 h et 21 h',
        ['08:00'],
        ['09:00', '21:00'],
        ['08:00'],
        '2026-10-09 09:00',
      ],
      ['seule 20 h donnée, reprise aux mêmes heures', H, H, ['20:00'], '2026-10-09 08:00'],
    ])(
      '%s : la première journée de la reprise est couverte, rien à redonner',
      (_, hours, at, given, next) => {
        const { settings, lines } = milo(hours, at, given)
        for (const today of ['2026-10-08', '2026-10-09']) {
          const read = view(settings, lines, today)
          expect(read.slots('2026-10-08', '2026-10-08').map(({ state }) => state)).toEqual(
            at.map(() => 'covered'),
          )
          expect(keys(read.unloggedDoses)).toEqual([])
        }
        const read = view(settings, lines, '2026-10-08')
        expect([read.phase, keys(read.currentDoses)]).toEqual(['upcoming', [next]])
      },
    )

    it('les prises d’avant l’arrêt restent comptées dans leur période (#819) : chacune couvre sa dose', () => {
      const { settings, lines, ofDay8 } = milo(H, ['09:00', '21:00'])
      expect(effectsOf(view(settings, lines, '2026-10-08'), ofDay8)).toEqual([
        { kind: 'covers', key: '2026-10-08 08:00' },
        { kind: 'covers', key: '2026-10-08 20:00' },
      ])
    })

    describe('8 h, 14 h et 20 h du 8 données, reprise à 20 h seulement (#821)', () => {
      const hours = ['08:00', '14:00', '20:00']

      it('aucune prise n’est sans effet, et la dose de 20 h du 8 n’existe qu’une fois', () => {
        const { settings, lines, ofDay8 } = milo(hours, ['20:00'])
        const read = view(settings, lines, '2026-10-08')
        expect(effectsOf(read, ofDay8)).toEqual([
          { kind: 'covers', key: '2026-10-08 08:00' },
          { kind: 'covers', key: '2026-10-08 14:00' },
          { kind: 'covers', key: '2026-10-08 20:00' },
        ])
        expect(read.slots('2026-10-08', '2026-10-08').map(({ due, by }) => [due, by?.id])).toEqual([
          [{ settingId: 'p2', dueOn: '2026-10-08', dueTime: '20:00' }, ofDay8[2]!.id],
        ])
        expect(keys([read.nextDue!])).toEqual(['2026-10-09 20:00'])
      })

      it('20 h non donnée : 8 h et 14 h couvrent leurs doses, la journée de la reprise est couverte', () => {
        const { settings, lines, ofDay8 } = milo(hours, ['20:00'], ['08:00', '14:00'])
        const read = view(settings, lines, '2026-10-08')
        expect(effectsOf(read, ofDay8)).toEqual([
          { kind: 'covers', key: '2026-10-08 08:00' },
          { kind: 'covers', key: '2026-10-08 14:00' },
        ])
        expect(read.dueState({ dueOn: '2026-10-08', dueTime: '20:00' })).toBe('covered')
        expect(keys(read.currentDoses)).toEqual(['2026-10-09 20:00'])
      })

      it('lecture du modèle naïf, 8 h et 14 h données : rien à redonner, prochaine dose le 9 à 20 h', () => {
        const naive = [
          reference.setting('p1', '2026-10-05', reference.DAY, hours, { stoppedOn: '2026-10-08' }),
          reference.setting('p2', '2026-10-08', reference.DAY, ['20:00']),
        ]
        const lines = [...before, '2026-10-08'].flatMap((day) =>
          (day === '2026-10-08' ? hours.slice(0, 2) : hours).map((hour) =>
            reference.line('p1', 'given', day, hour),
          ),
        )
        expect(reference.read(naive, lines, '2026-10-08')).toMatchObject({
          current: ['2026-10-09 20:00'],
          unlogged: [],
        })
      })
    })

    it('lecture du modèle naïf, 8 h donnée, reprise à 9 h et 21 h : rien à redonner', () => {
      const naive = [
        reference.setting('p1', '2026-10-05', reference.DAY, ['08:00'], {
          stoppedOn: '2026-10-08',
        }),
        reference.setting('p2', '2026-10-08', reference.DAY, ['09:00', '21:00']),
      ]
      const lines = [...before, '2026-10-08'].map((day) =>
        reference.line('p1', 'given', day, '08:00'),
      )
      expect(reference.read(naive, lines, '2026-10-08')).toMatchObject({
        current: ['2026-10-09 09:00'],
        unlogged: [],
      })
    })
  })

  describe('#823 : tous les jours, dose du 2 avr. donnée ; arrêté le 2, repris le 2 dès le 2, arrêté de nouveau le 2', () => {
    const settingsOf = (hours: string[], resumptions: number) => [
      setting('p1', '2026-03-30', DAY, hours, { stoppedOn: '2026-04-02' }),
      ...Array.from({ length: resumptions }, (_, index) =>
        setting(`r${index + 1}`, '2026-04-02', DAY, hours, { stoppedOn: '2026-04-02' }),
      ),
    ]
    const givenOn = (day: string, hours: string[]) =>
      hours.map((hour) => line('p1', 'given', day, hour))
    const givenOn2 = (hours: string[]) => givenOn('2026-04-02', hours)
    const before = (hours: string[]) =>
      ['2026-03-30', '2026-03-31', '2026-04-01'].flatMap((day) => givenOn(day, hours))

    it.each<[string, string[], number]>([
      ['à 20 h, une reprise', ['20:00'], 1],
      ['à 8 h et 20 h, une reprise', H, 1],
      ['à 20 h, deux reprises', ['20:00'], 2],
      ['à 8 h et 20 h, trois reprises', H, 3],
    ])('%s : les prises d’avant le premier arrêt couvrent leurs doses', (_, hours, resumptions) => {
      const given = givenOn2(hours)
      const read = view(settingsOf(hours, resumptions), [...before(hours), ...given], '2026-04-02')
      expect(effectsOf(read, given)).toEqual(
        hours.map((hour) => ({ kind: 'covers', key: `2026-04-02 ${hour}` })),
      )
      expect([read.phase, read.finished]).toEqual(['stopped', true])
    })

    it('la reprise a noté de nouveau la dose de 20 h du 2 : une seule prise la couvre', () => {
      const given = givenOn2(['20:00'])
      const again = line('r1', 'given', '2026-04-02', '20:00')
      const read = view(settingsOf(['20:00'], 1), [...given, again], '2026-04-02')
      const covering = effectsOf(read, [...given, again]).filter(({ kind }) => kind === 'covers')
      expect(covering).toEqual([{ kind: 'covers', key: '2026-04-02 20:00' }])
    })
  })

  it('lecture du modèle naïf, « Test » arrêté le 13 : arrêté, aucune dose à renseigner ni à venir', () => {
    const test = reference.setting('p1', STOP, reference.TWO_DAYS, H, { stoppedOn: STOP })
    const lines = [STOP, '2026-10-15'].flatMap((day) =>
      H.map((hour) => reference.line('p1', 'given', day, hour)),
    )
    expect(reference.read([test], lines, STOP)).toEqual({
      phase: 'stopped',
      finished: true,
      current: [],
      unlogged: [],
      upcoming: [],
    })
  })

  it('lecture du modèle naïf, mensuel arrêté le 13 oct. puis repris dès le 13 nov. : prochaine dose le 13 nov., aucune dose à renseigner', () => {
    const monthly = reference.setting('p1', '2026-09-13', reference.MONTH, [], { stoppedOn: STOP })
    const resumed = reference.setting('p2', '2026-11-13', reference.MONTH, [], { startsOn: STOP })
    const lines = ['2026-09-13', STOP].map((day) => reference.line('p1', 'given', day))
    expect(reference.read([monthly, resumed], lines, STOP)).toMatchObject({
      phase: 'upcoming',
      current: ['2026-11-13'],
      unlogged: [],
    })
  })
})
