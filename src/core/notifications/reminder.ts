/** `title` et `body` arrivent déjà traduits de la feature appelante. */
export interface Reminder {
  /** Clé métier stable et unique, p. ex. `vaccination:<uuid>`. */
  key: string
  title: string
  body: string
  /** Déclenchement souhaité : l'alarme est inexacte, l'heure n'est pas garantie. */
  at: Date
}

export interface ScheduledReminder {
  id: number
  /** Absente si la notification n'a pas été posée par ce service. */
  key?: string
  title: string
  body: string
  at?: Date
}

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193
const MAX_INT32 = 0x7fffffff

export function reminderNotificationId(key: string): number {
  let hash = FNV_OFFSET_BASIS

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME)
  }

  // `>>> 0` ramène le hash signé de `Math.imul` dans les entiers non signés.
  return ((hash >>> 0) % MAX_INT32) + 1
}
