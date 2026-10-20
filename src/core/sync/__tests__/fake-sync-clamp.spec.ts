// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clampedWrite, postgrestInstant, serverInstant } from './fake-sync-clamp'

const NOW = Date.parse('2026-10-19T08:00:00.000Z')
const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString()
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const ahead = (offsetMs: number) => ({ sent_at: at(offsetMs), received_at: serverInstant(NOW) })

describe('clampedWrite, la règle du serveur rejouée par le faux serveur', () => {
  it('une création sous un envoi en avance de 3 jours recule toutes ses dates du même écart', () => {
    const row = { id: 'a', created_at: at(3 * DAY - HOUR), updated_at: at(3 * DAY) }

    expect(clampedWrite(row, null, ahead(3 * DAY), NOW)).toEqual({
      id: 'a',
      created_at: '2026-10-19T07:00:00.000000Z',
      updated_at: '2026-10-19T08:00:00.000000Z',
    })
  })

  it('une date stockée en microsecondes, renvoyée à la milliseconde, ne recule pas', () => {
    const stored = { id: 'a', created_at: '2026-10-18T08:00:00.123718Z', updated_at: at(-HOUR) }
    const incoming = { id: 'a', created_at: '2026-10-18T08:00:00.123Z', updated_at: at(3 * DAY) }

    expect(clampedWrite(incoming, stored, ahead(3 * DAY), NOW)).toEqual({
      id: 'a',
      created_at: '2026-10-18T08:00:00.123Z',
      updated_at: '2026-10-19T08:00:00.000000Z',
    })
  })

  it('une écriture décalée qui n’est pas plus récente que la ligne du serveur est refusée', () => {
    const stored = { id: 'a', updated_at: at(30 * 60 * 1000) }

    expect(clampedWrite({ id: 'a', updated_at: at(3 * DAY) }, stored, ahead(3 * DAY), NOW)).toBe(
      null,
    )
  })

  it('un envoi lisible reste borné à 24 h : 10 jours au geste, 25 h à l’envoi, ou 1000 ans', () => {
    for (const updatedAt of [at(10 * DAY), '3026-10-19T08:00:00.000Z']) {
      expect(
        clampedWrite({ id: 'a', updated_at: updatedAt }, null, ahead(25 * HOUR), NOW)?.updated_at,
      ).toBe('2026-10-19T08:00:00.000000Z')
    }
  })

  it('sans envoi, l’écart vient de la date changée la plus récente', () => {
    const row = { id: 'a', created_at: at(2 * DAY), updated_at: at(3 * DAY) }

    expect(clampedWrite(row, null, null, NOW)).toEqual({
      id: 'a',
      created_at: '2026-10-18T08:00:00.000000Z',
      updated_at: '2026-10-19T08:00:00.000000Z',
    })
  })

  it('sous un envoi en avance, une écriture qui ne change aucune date passe telle quelle', () => {
    const stored = { id: 'a', name: 'Luna', updated_at: at(-HOUR) }
    const incoming = { ...stored, name: 'Nom seul' }

    expect(clampedWrite(incoming, stored, ahead(3 * DAY), NOW)).toBe(incoming)
  })

  it('PostgREST rend un instant en +00:00, sans zéros de fraction', () => {
    expect(
      ['2026-10-01T07:00:00.000Z', '2026-10-01T07:00:00.120Z', '2026-10-01T07:00:00.000718Z'].map(
        postgrestInstant,
      ),
    ).toEqual([
      '2026-10-01T07:00:00+00:00',
      '2026-10-01T07:00:00.12+00:00',
      '2026-10-01T07:00:00.000718+00:00',
    ])
  })

  it('à moins de 24 h d’avance, rien ne bouge', () => {
    const row = { id: 'a', updated_at: at(23 * HOUR) }

    expect(clampedWrite(row, null, ahead(23 * HOUR), NOW)).toBe(row)
  })

  describe('la date gardée dans la grille d’avant', () => {
    const grid = (writtenAt: string) =>
      `{"frequency":{"value":2,"unit":"day"},"endsOn":null,"writtenAt":"${writtenAt}","runs":[["2026-03-01",null]]}`

    it('recule du même écart quand l’écriture la change, le reste du texte intact', () => {
      const row = { id: 'p3', updated_at: at(3 * DAY), grid_before: grid(at(3 * DAY - HOUR)) }

      expect(clampedWrite(row, null, ahead(3 * DAY), NOW)?.grid_before).toBe(
        grid('2026-10-19T07:00:00.000Z'),
      )
    })

    it('déjà tenue par le serveur, elle ne recule pas', () => {
      const stored = { id: 'p3', updated_at: at(-HOUR), grid_before: grid(at(-HOUR)) }
      const incoming = {
        ...stored,
        updated_at: at(3 * DAY),
        grid_before: grid(at(-HOUR)).replace('null]]', '"2026-03-20"]]'),
      }

      expect(clampedWrite(incoming, stored, ahead(3 * DAY), NOW)?.grid_before).toBe(
        incoming.grid_before,
      )
    })

    it('vide, illisible ou sans date, elle passe telle quelle', () => {
      for (const value of [null, 'pas du json', '{"frequency":{"value":2,"unit":"day"}}']) {
        const row = { id: 'p3', updated_at: at(3 * DAY), grid_before: value }

        expect(clampedWrite(row, null, ahead(3 * DAY), NOW)?.grid_before).toBe(value)
      }
    })

    it('bornée à now() + 24 h comme les autres dates', () => {
      const row = { id: 'p4', updated_at: at(0), grid_before: grid(at(30 * HOUR)) }

      expect(clampedWrite(row, null, null, NOW)?.grid_before).toBe(grid('2026-10-19T08:00:00.000Z'))
    })
  })
})
