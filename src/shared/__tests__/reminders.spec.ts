import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildReminders, type ReminderSource } from '../reminders'

const TODAY = '2026-09-09'

function source(overrides: Partial<ReminderSource> = {}): ReminderSource {
  return {
    kind: 'vaccination',
    id: 'v1',
    animalId: 'milo',
    label: 'Rage',
    dueDate: TODAY,
    ...overrides,
  }
}

describe('buildReminders', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  describe('statuts', () => {
    it('−1 j est en retard', () => {
      const { reminders } = buildReminders([source({ dueDate: '2026-09-08' })], { today: TODAY })
      expect(reminders[0]).toMatchObject({ status: 'overdue', daysUntil: -1 })
    })

    it('0 j est aujourd’hui', () => {
      const { reminders } = buildReminders([source({ dueDate: TODAY })], { today: TODAY })
      expect(reminders[0]).toMatchObject({ status: 'today', daysUntil: 0 })
    })

    it('+1 j est demain', () => {
      const { reminders } = buildReminders([source({ dueDate: '2026-09-10' })], { today: TODAY })
      expect(reminders[0]).toMatchObject({ status: 'tomorrow', daysUntil: 1 })
    })

    it('+2 j et au-delà est plus tard', () => {
      const { reminders } = buildReminders(
        [source({ id: 'a', dueDate: '2026-09-11' }), source({ id: 'b', dueDate: '2026-10-09' })],
        { today: TODAY },
      )
      expect(reminders[0]).toMatchObject({ status: 'later', daysUntil: 2 })
      expect(reminders[1]).toMatchObject({ status: 'later', daysUntil: 30 })
    })

    it('compte en jours civils, pas en tranches de 24 h', () => {
      const { reminders } = buildReminders([source({ dueDate: '2026-03-30' })], {
        today: '2026-03-28',
      })
      expect(reminders[0]?.daysUntil).toBe(2)
    })
  })

  describe('tri', () => {
    it('du plus en retard au plus lointain', () => {
      const { reminders } = buildReminders(
        [
          source({ id: 'later', dueDate: '2026-09-12' }),
          source({ id: 'overdue-2', dueDate: '2026-09-07' }),
          source({ id: 'today', dueDate: TODAY }),
          source({ id: 'overdue-1', dueDate: '2026-09-08' }),
          source({ id: 'tomorrow', dueDate: '2026-09-10' }),
        ],
        { today: TODAY },
      )
      expect(reminders.map((r) => r.id)).toEqual([
        'overdue-2',
        'overdue-1',
        'today',
        'tomorrow',
        'later',
      ])
    })

    it('à échéance égale, par libellé puis par id', () => {
      const { reminders } = buildReminders(
        [
          source({ id: 'z', label: 'Vermifuge' }),
          source({ id: 'b', label: 'Rage' }),
          source({ id: 'a', label: 'Rage' }),
        ],
        { today: TODAY },
      )
      expect(reminders.map((r) => r.id)).toEqual(['a', 'b', 'z'])
    })

    it('ne modifie pas le tableau d’entrée', () => {
      const sources = [
        source({ id: 'b', dueDate: '2026-09-10' }),
        source({ id: 'a', dueDate: '2026-09-08' }),
      ]
      buildReminders(sources, { today: TODAY })
      expect(sources.map((s) => s.id)).toEqual(['b', 'a'])
    })
  })

  describe('portée', () => {
    const sources = [
      source({ id: 'v-milo', animalId: 'milo', dueDate: '2026-09-08' }),
      source({ id: 't-luna', kind: 'treatment', animalId: 'luna', label: 'Vermifuge' }),
      source({ id: 'v-luna', animalId: 'luna', dueDate: '2026-09-12' }),
    ]

    it('sans animalId, tous les animaux', () => {
      const result = buildReminders(sources, { today: TODAY })
      expect(result.reminders.map((r) => r.id)).toEqual(['v-milo', 't-luna', 'v-luna'])
      expect(result.total).toBe(3)
      expect(result.overdue).toBe(1)
    })

    it('avec animalId, un seul animal', () => {
      const result = buildReminders(sources, { today: TODAY, animalId: 'luna' })
      expect(result.reminders.map((r) => r.id)).toEqual(['t-luna', 'v-luna'])
      expect(result.total).toBe(2)
      expect(result.overdue).toBe(0)
    })

    it('un animal inconnu ne donne rien', () => {
      const result = buildReminders(sources, { today: TODAY, animalId: 'nala' })
      expect(result).toEqual({ reminders: [], total: 0, overdue: 0 })
    })
  })

  describe('exclusions et compteurs', () => {
    it('un vaccin sans échéance n’est pas un rappel', () => {
      const result = buildReminders(
        [source({ id: 'sans', dueDate: null }), source({ id: 'avec', dueDate: '2026-09-08' })],
        { today: TODAY },
      )
      expect(result.reminders.map((r) => r.id)).toEqual(['avec'])
      expect(result.total).toBe(1)
      expect(result.overdue).toBe(1)
    })

    it('compte les retards, pas les rappels du jour', () => {
      const result = buildReminders(
        [
          source({ id: 'a', dueDate: '2026-09-01' }),
          source({ id: 'b', dueDate: '2026-09-08' }),
          source({ id: 'c', dueDate: TODAY }),
          source({ id: 'd', dueDate: '2026-09-10' }),
        ],
        { today: TODAY },
      )
      expect(result.total).toBe(4)
      expect(result.overdue).toBe(2)
    })

    it('liste vide', () => {
      expect(buildReminders([], { today: TODAY })).toEqual({ reminders: [], total: 0, overdue: 0 })
    })

    it('conserve la source et garantit une échéance non nulle', () => {
      const { reminders } = buildReminders(
        [source({ kind: 'treatment', id: 't1', animalId: 'luna', label: 'Vermifuge' })],
        { today: TODAY },
      )
      expect(reminders[0]).toEqual({
        kind: 'treatment',
        id: 't1',
        animalId: 'luna',
        label: 'Vermifuge',
        dueDate: TODAY,
        status: 'today',
        daysUntil: 0,
      })
    })
  })

  describe('indépendance à l’horloge', () => {
    it('seul `today` décide du statut', () => {
      const sources = [source({ dueDate: '2026-09-09' })]
      expect(buildReminders(sources, { today: '2026-09-08' }).reminders[0]?.status).toBe('tomorrow')
      expect(buildReminders(sources, { today: '2026-09-09' }).reminders[0]?.status).toBe('today')
      expect(buildReminders(sources, { today: '2026-09-10' }).reminders[0]?.status).toBe('overdue')
    })

    it('n’appelle jamais l’horloge système', () => {
      vi.useFakeTimers({ now: new Date('1999-12-31T23:59:59.999Z') })
      const RealDate = Date
      vi.stubGlobal(
        'Date',
        new Proxy(RealDate, {
          construct(target, args) {
            if (args.length === 0) throw new Error('new Date() sans argument')
            return new target(...(args as [string]))
          },
          apply() {
            throw new Error('Date() sans argument')
          },
        }),
      )
      try {
        const { reminders, overdue } = buildReminders(
          [source({ dueDate: '2026-09-08' }), source({ id: 'v2', dueDate: '2026-09-10' })],
          { today: TODAY },
        )
        expect(reminders.map((r) => r.status)).toEqual(['overdue', 'tomorrow'])
        expect(overdue).toBe(1)
      } finally {
        vi.unstubAllGlobals()
      }
    })
  })
})
