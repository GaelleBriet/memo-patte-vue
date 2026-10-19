// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { clampedWrite, serverInstant } from './fake-sync-clamp'

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

  it('à moins de 24 h d’avance, rien ne bouge', () => {
    const row = { id: 'a', updated_at: at(23 * HOUR) }

    expect(clampedWrite(row, null, ahead(23 * HOUR), NOW)).toBe(row)
  })
})
