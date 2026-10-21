import type { SyncOutboxEntry } from '../repository/sync-outbox.repository'

const CHECK_VIOLATION = '23514'
const DATA_EXCEPTION_CLASS = '22'
const IDENTICAL_REFUSALS_BEFORE_DROP = 3

type RefusedEntry = Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>

/** Un refus que le serveur rendra à l'identique tant que la ligne ne change pas ; `null` sinon. */
function permanentRefusalSignature(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null) return null
  const { code, message } = cause as { code?: unknown; message?: unknown }
  if (typeof code !== 'string') return null
  if (code !== CHECK_VIOLATION && !code.startsWith(DATA_EXCEPTION_CLASS)) return null
  return `${code} ${typeof message === 'string' ? message : ''}`
}

/** Compte, pour chaque version d'une ligne en file, les refus permanents identiques qui se suivent. */
export function createPushRefusals() {
  const refusals = new Map<string, { queuedAt: string; signature: string; count: number }>()
  const keyOf = ({ entity, entityId }: RefusedEntry) => `${entity}/${entityId}`

  return {
    /** Vrai au troisième refus permanent identique de la même version : la ligne sort de la file. */
    isGivenUp(entry: RefusedEntry, cause: unknown): boolean {
      const key = keyOf(entry)
      const signature = permanentRefusalSignature(cause)
      if (signature === null) {
        refusals.delete(key)
        return false
      }
      const previous = refusals.get(key)
      const count =
        previous?.queuedAt === entry.queuedAt && previous.signature === signature
          ? previous.count + 1
          : 1
      if (count >= IDENTICAL_REFUSALS_BEFORE_DROP) {
        refusals.delete(key)
        return true
      }
      refusals.set(key, { queuedAt: entry.queuedAt, signature, count })
      return false
    },

    forget(entry: RefusedEntry): void {
      refusals.delete(keyOf(entry))
    },
  }
}
