/**
 * Modèle de rappel local, indépendant du plugin Capacitor.
 *
 * Les rappels ne sont jamais stockés tels quels : ils sont dérivés des données
 * métier (vaccins, traitements) persistées en SQLite, ce qui permet de tout
 * reprogrammer après une restauration (cf. `docs/technical/01-architecture-v2.md`).
 */
export interface Reminder {
  /** Clé métier stable et unique, p. ex. `vaccination:<uuid>`. */
  key: string
  /** Titre affiché, déjà traduit par la feature appelante. */
  title: string
  /** Corps affiché, déjà traduit par la feature appelante. */
  body: string
  /** Date et heure de déclenchement souhaitées (alarme inexacte). */
  at: Date
}

/** Rappel actuellement programmé auprès du système. */
export interface ScheduledReminder {
  /** Identifiant numérique programmé, dérivé de `key`. */
  id: number
  /** Clé métier d'origine, absente si la notification n'a pas été posée par ce service. */
  key?: string
  title: string
  body: string
  at?: Date
}

const FNV_OFFSET_BASIS = 0x811c9dc5
const FNV_PRIME = 0x01000193
/** Masque 31 bits : garantit un entier positif dans la plage d'un int 32 bits signé. */
const POSITIVE_INT32_MASK = 0x7fffffff

/**
 * Dérive de façon déterministe l'identifiant numérique exigé par le plugin
 * (entier 32 bits signé) à partir d'une clé métier, via un hachage FNV-1a.
 *
 * Même clé ⇒ même identifiant : on peut donc annuler ou reprogrammer un rappel
 * sans avoir mémorisé l'identifiant généré précédemment.
 */
export function reminderNotificationId(key: string): number {
  let hash = FNV_OFFSET_BASIS

  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index)
    hash = Math.imul(hash, FNV_PRIME)
  }

  return hash & POSITIVE_INT32_MASK
}
