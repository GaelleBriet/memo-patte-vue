export const CONTACT_ADDRESS = 'memopatte@gaelle-briet.fr'

export type ContactTopic = 'question' | 'suggestion'

export type ContactMail = { subject: string; body: string }

const LINE_BREAK = '\r\n'

/** Lignes vides d'abord : on écrit au-dessus des versions. */
export function contactMailBody(details: string[]): string {
  return LINE_BREAK.repeat(3) + details.join(LINE_BREAK)
}

export function contactMailUrl({ subject, body }: ContactMail): string {
  return `mailto:${CONTACT_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
