import type { SyncCycleOutbox } from '../service/sync-cycle'

export interface FakeOutboxEntry {
  entity: string
  entityId: string
  queuedAt: string
  attempts: number
  refusedAt?: string
}

export function createFakeOutbox(
  initial: FakeOutboxEntry[] = [],
  cursors: Record<string, string> = {},
  enabled = true,
): SyncCycleOutbox & {
  entries: () => FakeOutboxEntry[]
  cursor: (entity: string) => string | null
  lastSyncedAt: () => string | null
  /** `entity/entityId` des entrées dont un ancêtre est refusé. */
  underRefusedParent: Set<string>
} {
  let entries = [...initial]
  const lastPulledAt = new Map(Object.entries(cursors))
  let lastSyncedAt: string | null = null
  const underRefusedParent = new Set<string>()
  return {
    async listPending() {
      return entries
        .filter(({ refusedAt }) => refusedAt === undefined)
        .map(({ entity, entityId, queuedAt, attempts }) => ({
          entity,
          entityId,
          queuedAt,
          attempts,
        }))
    },
    async removeIfUnchanged(target) {
      entries = entries.filter(
        (entry) =>
          !(
            entry.entity === target.entity &&
            entry.entityId === target.entityId &&
            entry.queuedAt === target.queuedAt
          ),
      )
    },
    async markRefusedIfUnchanged(target, refusedAt) {
      entries = entries.map((entry) =>
        entry.entity === target.entity &&
        entry.entityId === target.entityId &&
        entry.queuedAt === target.queuedAt
          ? { ...entry, refusedAt }
          : entry,
      )
    },
    async markRefusedWithRefusedAncestor(target, refusedAt) {
      let marked = false
      entries = entries.map((entry) => {
        const matches =
          entry.entity === target.entity &&
          entry.entityId === target.entityId &&
          entry.queuedAt === target.queuedAt &&
          underRefusedParent.has(`${entry.entity}/${entry.entityId}`)
        marked ||= matches
        return matches ? { ...entry, refusedAt } : entry
      })
      return marked
    },
    async getLastPulledAt(entity) {
      return lastPulledAt.get(entity) ?? null
    },
    async setLastPulledAt(entity, value) {
      lastPulledAt.set(entity, value)
    },
    async isEnabled() {
      return enabled
    },
    async setLastSyncedAt(value) {
      lastSyncedAt = value
    },
    async recordFailedPush(target) {
      entries = entries.map((entry) =>
        entry.entity === target.entity && entry.entityId === target.entityId
          ? { ...entry, attempts: entry.attempts + 1 }
          : entry,
      )
    },
    entries: () => entries,
    cursor: (entity) => lastPulledAt.get(entity) ?? null,
    lastSyncedAt: () => lastSyncedAt,
    underRefusedParent,
  }
}
