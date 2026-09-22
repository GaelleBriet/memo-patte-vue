// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { normalizeSyncTimestamps } from '../service/normalize-sync-timestamps'

describe('normalizeSyncTimestamps', () => {
  it('ramène un timestamptz rendu avec un décalage au format toISOString', () => {
    const row = {
      id: 'a1',
      created_at: '2026-01-01T00:00:00+00:00',
      updated_at: '2026-01-01T10:30:00.123456+00:00',
      deleted_at: null,
      birth_date: '2020-05-01',
    }

    const normalized = normalizeSyncTimestamps(row)

    expect(normalized.created_at).toBe('2026-01-01T00:00:00.000Z')
    expect(normalized.updated_at).toBe('2026-01-01T10:30:00.123Z')
    expect(normalized.deleted_at).toBeNull()
    expect(normalized.birth_date).toBe('2020-05-01')
  })

  it('laisse une colonne déjà au format toISOString identique', () => {
    const row = { id: 'a1', updated_at: '2026-01-01T00:00:00.000Z' }

    expect(normalizeSyncTimestamps(row).updated_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('normalise un deleted_at renseigné (tombstone)', () => {
    const row = {
      id: 'a1',
      updated_at: '2026-01-01T00:00:00Z',
      deleted_at: '2026-02-01T09:00:00+02:00',
    }

    expect(normalizeSyncTimestamps(row).deleted_at).toBe('2026-02-01T07:00:00.000Z')
  })

  it("ne mute pas la ligne d'origine", () => {
    const row = { id: 'a1', updated_at: '2026-01-01T00:00:00+00:00' }

    const normalized = normalizeSyncTimestamps(row)

    expect(row.updated_at).toBe('2026-01-01T00:00:00+00:00')
    expect(normalized).not.toBe(row)
  })
})
