import { describe, expect, it } from 'vitest'

import { buildTodo, TODO_WINDOW_DAYS } from '../logic/todo-window'
import type { ReminderSource } from '@/shared/domain/reminders'

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

describe('TODO_WINDOW_DAYS', () => {
  it('vaut 30 jours', () => {
    expect(TODO_WINDOW_DAYS).toBe(30)
  })
})

describe('buildTodo', () => {
  describe('fenêtre de 30 jours', () => {
    it('garde une échéance à 30 jours et écarte celle à 31', () => {
      const todo = buildTodo(
        [
          source({ id: 'j30', dueDate: '2026-10-09' }),
          source({ id: 'j31', dueDate: '2026-10-10' }),
        ],
        { today: TODAY },
      )

      expect(todo.reminders.map((r) => r.id)).toEqual(['j30'])
    })

    it('garde un retard ancien, quel que soit le retard', () => {
      const todo = buildTodo([source({ id: 'ancien', dueDate: '2025-01-01' })], { today: TODAY })

      expect(todo.reminders.map((r) => r.id)).toEqual(['ancien'])
      expect(todo.reminders[0]?.status).toBe('overdue')
    })

    it('garde l’échéance du jour et du lendemain', () => {
      const todo = buildTodo(
        [source({ id: 'demain', dueDate: '2026-09-10' }), source({ id: 'jour', dueDate: TODAY })],
        { today: TODAY },
      )

      expect(todo.reminders.map((r) => r.id)).toEqual(['jour', 'demain'])
    })

    it('ignore un rappel sans échéance', () => {
      const todo = buildTodo([source({ dueDate: null })], { today: TODAY })

      expect(todo).toEqual({ reminders: [], total: 0, overdue: 0, next: null })
    })
  })

  describe('compteurs', () => {
    it('ne comptent que les rappels affichés', () => {
      const todo = buildTodo(
        [
          source({ id: 'retard', dueDate: '2026-09-01' }),
          source({ id: 'bientot', dueDate: '2026-09-20' }),
          source({ id: 'loin', dueDate: '2027-08-26' }),
        ],
        { today: TODAY },
      )

      expect(todo.total).toBe(2)
      expect(todo.overdue).toBe(1)
    })
  })

  describe('prochain rappel hors fenêtre', () => {
    it('désigne le plus proche au-delà de la fenêtre', () => {
      const todo = buildTodo(
        [
          source({ id: 'dans-un-an', dueDate: '2027-09-01' }),
          source({ id: 'dans-deux-mois', dueDate: '2026-11-09' }),
          source({ id: 'j31', dueDate: '2026-10-10' }),
        ],
        { today: TODAY },
      )

      expect(todo.reminders).toEqual([])
      expect(todo.next).toMatchObject({ id: 'j31', dueDate: '2026-10-10', daysUntil: 31 })
    })

    it('départage deux échéances égales comme la liste : par libellé puis par id', () => {
      const todo = buildTodo(
        [
          source({ id: 'b', label: 'Typhus', dueDate: '2027-08-26' }),
          source({ id: 'a', label: 'Carré', dueDate: '2027-08-26' }),
        ],
        { today: TODAY },
      )

      expect(todo.next?.id).toBe('a')
    })

    it('reste vide quand aucun rappel n’existe au-delà', () => {
      const todo = buildTodo([source({ dueDate: '2026-09-20' })], { today: TODAY })

      expect(todo.next).toBeNull()
    })

    it('suit la portée de l’animal sélectionné', () => {
      const sources = [
        source({ id: 'milo', animalId: 'milo', dueDate: '2026-11-01' }),
        source({ id: 'luna', animalId: 'luna', dueDate: '2027-01-01' }),
      ]

      expect(buildTodo(sources, { today: TODAY, animalId: 'luna' }).next?.id).toBe('luna')
      expect(buildTodo(sources, { today: TODAY }).next?.id).toBe('milo')
    })
  })
})
