import type { AppLocale } from '@/core/i18n'

const HELP_PAGE_URLS: Record<AppLocale, string> = {
  fr: 'https://memopatte.app/aide/',
  en: 'https://memopatte.app/en/help/',
}

const REMINDERS_PAGES: Record<AppLocale, string> = {
  fr: 'rappels',
  en: 'reminders',
}

/** Page Aide du site, dans la langue de l'app. */
export function helpPageUrl(locale: AppLocale): string {
  return HELP_PAGE_URLS[locale]
}

/** Page « Rappels » de l'aide du site, dans la langue de l'app. */
export function remindersHelpUrl(locale: AppLocale): string {
  return `${HELP_PAGE_URLS[locale]}${REMINDERS_PAGES[locale]}/`
}
