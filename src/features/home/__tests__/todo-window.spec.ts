import { describe, expect, it } from 'vitest'

import type { TodoDueItem, TodoToLogItem, TodoUnreadableItem } from '../logic/todo-items'
import { buildTodo, TODO_LAST_DAY_OFFSET } from '../logic/todo-window'

const IDENTITY = {
  kind: 'treatment',
  id: 't1',
  animalId: 'milo',
  label: 'Milbemax',
  treatmentType: 'deworming',
} as const

function due(daysUntil: number, overrides: Partial<TodoDueItem> = {}): TodoDueItem {
  const id = overrides.id ?? `j${daysUntil}`
  const dueTime = overrides.dueTime ?? null
  return {
    ...IDENTITY,
    group: 'due',
    key: `${id}${dueTime ?? ''}`,
    status: daysUntil < 0 ? 'overdue' : daysUntil === 0 ? 'today' : 'later',
    daysUntil,
    dueOn: `day${daysUntil}`,
    dueTime,
    id,
    ...overrides,
  }
}

function toLog(oldest: string, overrides: Partial<TodoToLogItem> = {}): TodoToLogItem {
  const id = overrides.id ?? `log-${oldest}`
  return {
    ...IDENTITY,
    group: 'to-log',
    key: `${id}:unlogged`,
    unlogged: 2,
    oldest: { dueOn: oldest, dueTime: null },
    id,
    ...overrides,
  }
}

function unreadable(overrides: Partial<TodoUnreadableItem> = {}): TodoUnreadableItem {
  return { ...IDENTITY, group: 'unreadable', key: 'illisible', id: 'illisible', ...overrides }
}

function keys(items: { key: string }[]): string[] {
  return items.map(({ key }) => key)
}

describe('TODO_LAST_DAY_OFFSET', () => {
  it('va jusqu’à J+29 : 30 jours, aujourd’hui compris', () => {
    expect(TODO_LAST_DAY_OFFSET).toBe(29)
  })
})

describe('buildTodo', () => {
  describe('fenêtre de 30 jours, aujourd’hui compris (AC-5)', () => {
    it('garde une échéance à J+29 et écarte celle à J+30', () => {
      const todo = buildTodo([due(29), due(30)], {})

      expect(keys(todo.items)).toEqual(['j29'])
      expect(todo.next?.key).toBe('j30')
    })

    it('garde un retard ancien, quel que soit le retard', () => {
      expect(keys(buildTodo([due(-400)], {}).items)).toEqual(['j-400'])
    })

    it('garde « À renseigner » quelle que soit la prochaine dose du traitement', () => {
      const todo = buildTodo([due(35, { id: 'loin' }), toLog('2026-07-10', { id: 'loin' })], {})

      expect(keys(todo.items)).toEqual(['loin:unlogged'])
      expect(todo.next?.key).toBe('loin')
    })
  })

  describe('ordre (AC-6)', () => {
    it('retards du plus ancien, aujourd’hui, jours suivants, puis « À renseigner » (Accueil §4, critère 1)', () => {
      const todo = buildTodo(
        [
          toLog('2026-09-01', { id: 'panacur' }),
          due(3, { id: 'pixel' }),
          due(0, { id: 'luna', dueTime: '21:00' }),
          due(-2, { id: 'milo' }),
          due(-6, { id: 'advocate' }),
        ],
        {},
      )

      expect(keys(todo.items)).toEqual([
        'advocate',
        'milo',
        'luna21:00',
        'pixel',
        'panacur:unlogged',
      ])
    })

    it('aujourd’hui, les soins sans heure en tête, puis par heure (Accueil Q6)', () => {
      const todo = buildTodo(
        [
          due(0, { id: 'soir', dueTime: '20:00' }),
          due(0, { id: 'matin', dueTime: '08:00' }),
          due(0, { id: 'vaccin', kind: 'vaccination', label: 'Typhus' }),
        ],
        {},
      )

      expect(keys(todo.items)).toEqual(['vaccin', 'matin08:00', 'soir20:00'])
    })

    it('une journée en retard à deux heures : 8 h avant 20 h', () => {
      const todo = buildTodo(
        [due(-1, { id: 'm', dueTime: '20:00' }), due(-1, { id: 'm', dueTime: '08:00' })],
        {},
      )

      expect(keys(todo.items)).toEqual(['m08:00', 'm20:00'])
    })

    it('départage une même échéance par nom, puis par identifiant', () => {
      const todo = buildTodo(
        [
          due(4, { id: 'b', label: 'Typhus' }),
          due(4, { id: 'c', label: 'Carré' }),
          due(4, { id: 'a', label: 'Carré' }),
        ],
        {},
      )

      expect(keys(todo.items)).toEqual(['a', 'c', 'b'])
    })

    it('« À renseigner » : le traitement qui attend depuis le plus longtemps, puis par nom (B1)', () => {
      const todo = buildTodo(
        [
          toLog('2026-09-20', { id: 'recent', label: 'Advocate' }),
          toLog('2026-09-02', { id: 'zeta', label: 'Zeta' }),
          toLog('2026-09-02', { id: 'alpha', label: 'Alpha' }),
          toLog('2026-09-02', {
            id: 'soir',
            label: 'Aa',
            oldest: { dueOn: '2026-09-02', dueTime: '20:00' },
          }),
        ],
        {},
      )

      expect(keys(todo.items)).toEqual([
        'alpha:unlogged',
        'zeta:unlogged',
        'soir:unlogged',
        'recent:unlogged',
      ])
    })

    it('un traitement illisible ferme la liste des soins, avant « À renseigner »', () => {
      const todo = buildTodo([toLog('2026-09-02'), unreadable(), due(12)], {})

      expect(keys(todo.items)).toEqual(['j12', 'illisible', 'log-2026-09-02:unlogged'])
    })
  })

  describe('compteurs (AC-10)', () => {
    it('ne comptent que les soins affichés, jamais « À renseigner » ni une ligne illisible', () => {
      const todo = buildTodo([due(-3), due(0), due(400), toLog('2026-09-01'), unreadable()], {})

      expect(todo.total).toBe(2)
      expect(todo.overdue).toBe(1)
    })

    it('une journée en retard à deux heures compte pour deux (Q5)', () => {
      const todo = buildTodo([due(-1, { dueTime: '08:00' }), due(-1, { dueTime: '20:00' })], {})

      expect(todo.overdue).toBe(2)
    })
  })

  describe('prochain soin hors fenêtre (AC-11)', () => {
    it('désigne le plus proche au-delà de la fenêtre', () => {
      const todo = buildTodo([due(400), due(64), due(30), due(29)], {})

      expect(todo.next?.key).toBe('j30')
    })

    it('reste vide quand aucun soin n’existe au-delà', () => {
      expect(buildTodo([due(12)], {}).next).toBeNull()
    })

    it('suit la portée de l’animal sélectionné', () => {
      const items = [
        due(40, { id: 'milo', animalId: 'milo' }),
        due(90, { id: 'luna', animalId: 'luna' }),
      ]

      expect(buildTodo(items, { animalId: 'luna' }).next?.key).toBe('luna')
      expect(buildTodo(items, {}).next?.key).toBe('milo')
    })
  })

  it('filtre toutes les lignes sur l’animal sélectionné (AC-4)', () => {
    const todo = buildTodo(
      [
        due(1, { id: 'milo', animalId: 'milo' }),
        due(2, { id: 'luna', animalId: 'luna' }),
        toLog('2026-09-01', { id: 'luna-log', animalId: 'luna' }),
        unreadable({ animalId: 'milo' }),
      ],
      { animalId: 'luna' },
    )

    expect(keys(todo.items)).toEqual(['luna', 'luna-log:unlogged'])
  })

  it('reste vide sans rien à faire', () => {
    expect(buildTodo([], {})).toEqual({ items: [], total: 0, overdue: 0, next: null })
  })
})
