export const SENDER = 'noreply@memopatte.app'
export const CONTACT = 'contact@memopatte.app'

const NBSP = ' '

export type WarningEmail = { from: string; to: string; subject: string; text: string }

export type WarningRecipient = { email: string; locale: string | null }

export type InactivityCause =
  { kind: 'plus-ended'; accessEndedAt: string } | { kind: 'never-bought' }

type Locale = 'fr' | 'en'

function formatDay(instant: string, locale: Locale): string {
  const date = new Date(instant)
  const formatted = new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date)
  const withOrdinal =
    locale === 'fr' && date.getUTCDate() === 1 ? formatted.replace(/^1 /, '1er ') : formatted
  return locale === 'fr' ? withOrdinal.replace(/ /g, NBSP) : withOrdinal
}

const TEXTS: Record<
  Locale,
  (endedOn: string, purgeOn: string) => { subject: string; text: string }
> = {
  fr: (endedOn, purgeOn) => ({
    subject: `Votre compte MémoPatte sera supprimé le ${purgeOn}`,
    text:
      `Bonjour, votre accès MémoPatte Plus a pris fin le ${endedOn}. ` +
      "Comme l'annonce notre politique de confidentialité, un compte sans accès Plus pendant 12 mois est supprimé. " +
      `Le ${purgeOn}, nous supprimerons votre compte, adresse e-mail comprise, ` +
      'votre sauvegarde dans le cloud et vos photos sauvegardées. ' +
      'Les données sur votre téléphone ne sont pas touchées. ' +
      "Pour garder votre compte et votre sauvegarde, reprenez MémoPatte Plus dans l'app avant cette date. " +
      'Vous pouvez aussi exporter vos données gratuitement depuis Paramètres. ' +
      `Une question, ou pour supprimer votre compte dès maintenant${NBSP}: ${CONTACT}.`,
  }),
  en: (endedOn, purgeOn) => ({
    subject: `Your MémoPatte account will be deleted on ${purgeOn}`,
    text:
      `Hello, your MémoPatte Plus access ended on ${endedOn}. ` +
      'As our privacy policy states, an account without Plus access for 12 months is deleted. ' +
      `On ${purgeOn}, we will delete your account, including your email address, ` +
      'your cloud backup and your backed-up photos. ' +
      'The data on your phone is not affected. ' +
      'To keep your account and your backup, resume MémoPatte Plus in the app before that date. ' +
      'You can also export your data for free from Settings. ' +
      `Questions, or to delete your account right now: ${CONTACT}.`,
  }),
}

/** `null` : aucun texte validé pour ce cas, l'avertissement n'est pas envoyé. */
export function warningEmail(
  recipient: WarningRecipient,
  cause: InactivityCause,
  purgeOn: string,
): WarningEmail | null {
  if (cause.kind === 'never-bought') return null
  const locale: Locale = recipient.locale === 'fr' ? 'fr' : 'en'
  const { subject, text } = TEXTS[locale](
    formatDay(cause.accessEndedAt, locale),
    formatDay(`${purgeOn}T00:00:00.000Z`, locale),
  )
  return { from: SENDER, to: recipient.email, subject, text }
}
