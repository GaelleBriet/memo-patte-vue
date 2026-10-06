import { afterEach, describe, expect, it } from 'vitest'

import { carnetVaccinationRow } from '../logic/vaccination-carnet'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const TODAY = '2026-10-06'

function row(lastInjectionDate: string | null, dueDate: string | null, today = TODAY) {
  const { badge, detail } = carnetVaccinationRow(t, { lastInjectionDate, dueDate }, today)
  return { badge, detail: detail.replaceAll(' ', ' ') }
}

afterEach(() => {
  applyLocale('fr')
})

describe('carnetVaccinationRow — ligne d’un vaccin (VA-16, B · V11 et V15)', () => {
  it('à jour : « À jour » et la date du prochain rappel', () => {
    expect(row('2026-01-12', '2027-01-12')).toEqual({
      badge: { status: 'up-to-date', label: 'À jour' },
      detail: 'Prochain rappel le 12 janv. 2027',
    })
    expect(row('2026-01-12', '2026-12-20').detail).toBe('Prochain rappel le 20 déc.')
  })

  it('reste « À jour » le jour même du rappel', () => {
    expect(row('2025-10-06', TODAY).badge).toEqual({ status: 'up-to-date', label: 'À jour' })
  })

  it('en retard : « En retard · N j » et « Échéance passée »', () => {
    expect(row('2025-09-30', '2026-09-30')).toEqual({
      badge: { status: 'overdue', label: 'En retard · 6 j' },
      detail: 'Échéance passée',
    })
  })

  it('jamais fait : « Prévu le 5 oct. », même le jour du rendez-vous', () => {
    const prevu = { status: 'planned', label: 'Prévu le 9 oct.' }
    expect(row(null, '2026-10-09')).toEqual({
      badge: prevu,
      detail: 'Premier vaccin · aucune injection notée',
    })
    expect(row(null, TODAY).badge).toEqual({ status: 'planned', label: 'Prévu le 6 oct.' })
    expect(row(null, '2027-02-01').badge?.label).toBe('Prévu le 1er févr. 2027')
  })

  it('jamais fait et passé : en retard, comme un rappel', () => {
    expect(row(null, '2026-10-05')).toEqual({
      badge: { status: 'overdue', label: 'En retard · 1 j' },
      detail: 'Échéance passée',
    })
  })

  it('rendez-vous du 5 oct. : « Prévu » le jour même, en retard le lendemain sans injection', () => {
    expect(row(null, '2026-10-05', '2026-10-05')).toEqual({
      badge: { status: 'planned', label: 'Prévu le 5 oct.' },
      detail: 'Premier vaccin · aucune injection notée',
    })
    expect(row(null, '2026-10-05', '2026-10-06')).toEqual({
      badge: { status: 'overdue', label: 'En retard · 1 j' },
      detail: 'Échéance passée',
    })
  })

  it('sans rappel : « Pas de rappel », neutre', () => {
    expect(row('2026-01-12', null)).toEqual({
      badge: { status: 'none', label: 'Pas de rappel' },
      detail: 'Pas de rappel programmé',
    })
  })

  it('s’écrit en anglais', () => {
    applyLocale('en')

    expect(row('2026-01-12', '2027-01-12')).toEqual({
      badge: { status: 'up-to-date', label: 'Up to date' },
      detail: 'Next reminder on Jan 12, 2027',
    })
    expect(row(null, '2026-10-09')).toEqual({
      badge: { status: 'planned', label: 'Planned Oct 9' },
      detail: 'First vaccine · no injection logged',
    })
    expect(row('2025-09-30', '2026-09-30').badge).toEqual({
      status: 'overdue',
      label: 'Overdue · 6d',
    })
  })
})
