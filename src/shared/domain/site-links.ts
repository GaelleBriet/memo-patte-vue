import type { AppLocale } from '@/core/i18n'

const SITE_URLS: Record<AppLocale, string> = {
  fr: 'https://memopatte.gaelle-briet.fr/',
  en: 'https://memopatte.gaelle-briet.fr/en/',
}

const PRIVACY_POLICY_URLS: Record<AppLocale, string> = {
  fr: 'https://memopatte.gaelle-briet.fr/confidentialite/',
  en: 'https://memopatte.gaelle-briet.fr/en/privacy/',
}

const LEGAL_NOTICE_URL = 'https://gaelle-briet.fr/mentions-legales/'

export function siteUrl(locale: AppLocale): string {
  return SITE_URLS[locale]
}

export function privacyPolicyUrl(locale: AppLocale): string {
  return PRIVACY_POLICY_URLS[locale]
}

export function legalNoticeUrl(): string {
  return LEGAL_NOTICE_URL
}
