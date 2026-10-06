import { z } from 'zod'

export const HOME_MESSAGES_STORAGE_KEY = 'memopatte.home.messages'

const date = z.iso.datetime({ offset: true }).nullable()

const memorySchema = z.object({
  remindersClosedAt: date.default(null),
  protectClosed: z.boolean().default(false),
  quarterlyClosedAt: date.default(null),
  quarterlyStopped: z.boolean().default(false),
})

export type HomeMessagesMemory = z.infer<typeof memorySchema>

export const FRESH_HOME_MESSAGES: HomeMessagesMemory = {
  remindersClosedAt: null,
  protectClosed: false,
  quarterlyClosedAt: null,
  quarterlyStopped: false,
}

let sessionMemory: HomeMessagesMemory | null = null

export function readHomeMessagesMemory(): HomeMessagesMemory {
  try {
    const raw = localStorage.getItem(HOME_MESSAGES_STORAGE_KEY)
    if (raw === null) return FRESH_HOME_MESSAGES
    const parsed = memorySchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : FRESH_HOME_MESSAGES
  } catch {
    return sessionMemory ?? FRESH_HOME_MESSAGES
  }
}

/** Sans stockage, la fermeture tient jusqu'à la fin de la session. */
export function rememberHomeMessages(changes: Partial<HomeMessagesMemory>): HomeMessagesMemory {
  const next = { ...readHomeMessagesMemory(), ...changes }
  try {
    localStorage.setItem(HOME_MESSAGES_STORAGE_KEY, JSON.stringify(next))
  } catch (cause) {
    sessionMemory = next
    console.warn('Message de l’accueil : fermeture non enregistrée :', cause)
  }
  return next
}
