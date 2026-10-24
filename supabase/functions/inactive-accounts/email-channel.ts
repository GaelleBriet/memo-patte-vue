import type { WarningEmail } from './messages.ts'

export type EmailChannel = {
  /** Sans canal branché, la purge n'avertit personne et ne supprime donc rien. */
  connected: boolean
  send(email: WarningEmail): Promise<void>
}

export const NO_EMAIL_CHANNEL: EmailChannel = {
  connected: false,
  send() {
    return Promise.reject(new Error('Aucun canal d’e-mail branché'))
  },
}
