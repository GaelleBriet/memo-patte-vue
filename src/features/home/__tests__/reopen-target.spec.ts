import { describe, expect, it } from 'vitest'

import type { ReminderRow } from '../logic/home-summary'
import { reopenTarget } from '../logic/reopen-target'

const row = (id: string, dueOn: string): ReminderRow =>
  ({
    key: `treatment:${id}:${dueOn}`,
    group: 'due',
    request: { kind: 'treatment', id, due: { dueOn, dueTime: null } },
    opens: 'sheet',
  }) as ReminderRow

const rows = [row('t1', '2026-09-09')]

describe('reopenTarget', () => {
  it('« Donnée quand ? » pour une notification d’un jour passé', () => {
    const due = { dueOn: '2026-09-01', dueTime: null }
    expect(
      reopenTarget(rows, { kind: 'treatment', id: 't1', step: 'given-when', due }, true),
    ).toEqual({ to: 'given-when', id: 't1', due })
  })

  it('la feuille de l’échéance notifiée, même hors de la liste', () => {
    const due = { dueOn: '2026-09-01', dueTime: '08:00' }
    expect(reopenTarget(rows, { kind: 'treatment', id: 't1', step: 'actions', due }, true)).toEqual(
      { to: 'sheet', request: { kind: 'treatment', id: 't1', due }, step: 'actions' },
    )
  })

  it('la ligne de la liste quand on ne vient pas d’une notification', () => {
    expect(reopenTarget(rows, { kind: 'treatment', id: 't1', step: 'actions' }, false)).toEqual({
      to: 'sheet',
      request: rows[0]!.request,
      step: 'actions',
    })
  })

  it('rien à rouvrir : la fiche du soin pour une notification, sinon rien', () => {
    const request = { kind: 'vaccination' as const, id: 'v9', step: 'actions' as const }
    expect(reopenTarget(rows, request, true)).toEqual({
      to: 'detail',
      reminder: { kind: 'vaccination', id: 'v9' },
    })
    expect(reopenTarget(rows, request, false)).toEqual({ to: 'nothing' })
  })
})
