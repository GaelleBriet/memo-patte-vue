import type { SyncOutboxEntry } from '../repository/sync-outbox.repository'
import type { SyncCycleOutbox } from './sync-cycle'

const CHECK_VIOLATION = '23514'
const FOREIGN_KEY_VIOLATION = '23503'
const DATA_EXCEPTION_CLASS = '22'
const IDENTICAL_REFUSALS_BEFORE_GIVING_UP = 3

type RefusedEntry = Pick<SyncOutboxEntry, 'entity' | 'entityId' | 'queuedAt'>

/** Un refus que le serveur rendra à l'identique tant que la ligne ne change pas ; `null` sinon. */
type RefusalSignature = (cause: unknown) => string | null

function permanentRowRefusalSignature(cause: unknown): string | null {
  if (typeof cause !== 'object' || cause === null) return null
  const { code, message } = cause as { code?: unknown; message?: unknown }
  if (typeof code !== 'string') return null
  if (code !== CHECK_VIOLATION && !code.startsWith(DATA_EXCEPTION_CLASS)) return null
  return `${code} ${typeof message === 'string' ? message : ''}`
}

function isForeignKeyViolation(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    (cause as { code?: unknown }).code === FOREIGN_KEY_VIOLATION
  )
}

export interface PushRefusalsOptions {
  outbox: Pick<
    SyncCycleOutbox,
    'recordFailedPush' | 'markRefusedIfUnchanged' | 'hasRefusedAncestor'
  >
  signature?: RefusalSignature
  /** Journalise l'entrée marquée refusée ; le texte reste chez l'appelant, que la garde des journaux relit. */
  onGivenUp: (entry: RefusedEntry, cause: unknown) => void
  now: () => Date
}

/** Compte, pour chaque version d'une entrée en file, les refus permanents identiques qui se suivent. */
export function createPushRefusals({
  outbox,
  signature: permanentRefusalSignature = permanentRowRefusalSignature,
  onGivenUp,
  now,
}: PushRefusalsOptions) {
  const refusals = new Map<string, { queuedAt: string; signature: string; count: number }>()
  const keyOf = ({ entity, entityId }: RefusedEntry) => `${entity}/${entityId}`

  /** Vrai au troisième refus permanent identique de la même version. */
  function isGivenUp(entry: RefusedEntry, cause: unknown): boolean {
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
    if (count >= IDENTICAL_REFUSALS_BEFORE_GIVING_UP) {
      refusals.delete(key)
      return true
    }
    refusals.set(key, { queuedAt: entry.queuedAt, signature, count })
    return false
  }

  return {
    /** Compte l'essai raté ; rend vrai si l'entrée reste en file pour un prochain essai. */
    async recordFailure(entry: RefusedEntry, cause: unknown): Promise<boolean> {
      await outbox.recordFailedPush(entry)
      const withParent = isForeignKeyViolation(cause) && (await outbox.hasRefusedAncestor(entry))
      if (withParent) refusals.delete(keyOf(entry))
      else if (!isGivenUp(entry, cause)) return true
      await outbox.markRefusedIfUnchanged(entry, now().toISOString())
      onGivenUp(entry, cause)
      return false
    },

    forget(entry: RefusedEntry): void {
      refusals.delete(keyOf(entry))
    },
  }
}
