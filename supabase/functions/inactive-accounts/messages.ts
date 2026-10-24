export const SENDER = 'noreply@memopatte.app'
export const CONTACT = 'contact@memopatte.app'

const NBSP = ' '

export type WarningEmail = { from: string; to: string; subject: string; text: string }

export type WarningRecipient = { email: string; locale: string | null }

/** Une adresse jamais confirmée n'a pas de texte : elle n'est jamais avertie. */
export type InactivityCause =
  | { kind: 'plus-ended'; accessEndedAt: string }
  | { kind: 'never-bought'; createdAt: string }
  | { kind: 'unconfirmed' }

type WarnedCause = Exclude<InactivityCause, { kind: 'unconfirmed' }>

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

type Variant = { opening: string; keep: string }

const VARIANTS: Record<Locale, Record<WarnedCause['kind'], (since: string) => Variant>> = {
  fr: {
    'plus-ended': (since) => ({
      opening: `Bonjour, votre accès MémoPatte Plus a pris fin le ${since}. `,
      keep: "Pour garder votre compte et votre sauvegarde, reprenez MémoPatte Plus dans l'app avant cette date. ",
    }),
    'never-bought': (since) => ({
      opening: `Bonjour, votre compte MémoPatte a été créé le ${since} sans abonnement Plus. `,
      keep: "Pour garder votre compte et votre sauvegarde, abonnez-vous à MémoPatte Plus dans l'app avant cette date. ",
    }),
  },
  en: {
    'plus-ended': (since) => ({
      opening: `Hello, your MémoPatte Plus access ended on ${since}. `,
      keep: 'To keep your account and your backup, resume MémoPatte Plus in the app before that date. ',
    }),
    'never-bought': (since) => ({
      opening: `Hello, your MémoPatte account was created on ${since} without a Plus subscription. `,
      keep: 'To keep your account and your backup, subscribe to MémoPatte Plus in the app before that date. ',
    }),
  },
}

const TEXTS: Record<
  Locale,
  (variant: Variant, purgeOn: string) => { subject: string; text: string }
> = {
  fr: ({ opening, keep }, purgeOn) => ({
    subject: `Votre compte MémoPatte sera supprimé le ${purgeOn}`,
    text:
      opening +
      "Comme l'annonce notre politique de confidentialité, un compte sans accès Plus pendant 12 mois est supprimé. " +
      `Le ${purgeOn}, nous supprimerons votre compte, adresse e-mail comprise, ` +
      'votre sauvegarde dans le cloud et vos photos sauvegardées. ' +
      'Les données sur votre téléphone ne sont pas touchées. ' +
      keep +
      'Vous pouvez aussi exporter vos données gratuitement depuis Paramètres. ' +
      `Une question, ou pour supprimer votre compte dès maintenant${NBSP}: ${CONTACT}.`,
  }),
  en: ({ opening, keep }, purgeOn) => ({
    subject: `Your MémoPatte account will be deleted on ${purgeOn}`,
    text:
      opening +
      'As our privacy policy states, an account without Plus access for 12 months is deleted. ' +
      `On ${purgeOn}, we will delete your account, including your email address, ` +
      'your cloud backup and your backed-up photos. ' +
      'The data on your phone is not affected. ' +
      keep +
      'You can also export your data for free from Settings. ' +
      `Questions, or to delete your account right now: ${CONTACT}.`,
  }),
}

export function warningEmail(
  recipient: WarningRecipient,
  cause: InactivityCause,
  purgeOn: string,
): WarningEmail | null {
  if (cause.kind === 'unconfirmed') return null
  const locale: Locale = recipient.locale === 'fr' ? 'fr' : 'en'
  const since = cause.kind === 'plus-ended' ? cause.accessEndedAt : cause.createdAt
  const { subject, text } = TEXTS[locale](
    VARIANTS[locale][cause.kind](formatDay(since, locale)),
    formatDay(`${purgeOn}T00:00:00.000Z`, locale),
  )
  return { from: SENDER, to: recipient.email, subject, text }
}
