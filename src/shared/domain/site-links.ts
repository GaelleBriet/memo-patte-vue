import type { AppLocale } from '@/core/i18n'

const SITE_URLS: Record<AppLocale, string> = {
  fr: 'https://memopatte.app/',
  en: 'https://memopatte.app/en/',
}

const PRIVACY_POLICY_URLS: Record<AppLocale, string> = {
  fr: 'https://memopatte.app/confidentialite/',
  en: 'https://memopatte.app/en/privacy/',
}

const LEGAL_NOTICE_URL = 'https://gaelle-briet.fr/mentions-legales/'

const VACCINE_SOURCE_URL =
  'https://www.data.gouv.fr/datasets/base-de-donnees-publique-des-medicaments-veterinaires-autorises-en-france-1'

export function siteUrl(locale: AppLocale): string {
  return SITE_URLS[locale]
}

export function privacyPolicyUrl(locale: AppLocale): string {
  return PRIVACY_POLICY_URLS[locale]
}

export function legalNoticeUrl(): string {
  return LEGAL_NOTICE_URL
}

export function vaccineSourceUrl(): string {
  return VACCINE_SOURCE_URL
}
