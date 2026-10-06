import type { AppLocale } from '@/core/i18n'

const REMINDERS_HELP_URLS: Record<AppLocale, string> = {
  fr: 'https://memopatte.gaelle-briet.fr/aide/#rappels',
  en: 'https://memopatte.gaelle-briet.fr/en/help/#reminders',
}

/** Section « Rappels » de la page Aide du site, dans la langue de l'app. */
export function remindersHelpUrl(locale: AppLocale): string {
  return REMINDERS_HELP_URLS[locale]
}
