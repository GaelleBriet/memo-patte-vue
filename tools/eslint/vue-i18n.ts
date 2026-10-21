import type { Linter } from 'eslint'
import pluginVueI18n from '@intlify/eslint-plugin-vue-i18n'

const LOCALE_FILES = 'src/core/i18n/locales/*.json'

const VUE_I18N_SETTINGS = {
  'vue-i18n': { localeDir: `./${LOCALE_FILES}`, messageSyntaxVersion: '^11.0.0' },
}

const VUE_I18N_JSON_PARSER = pluginVueI18n.configs['flat/base'].find(
  (config) => config.name === '@intlify/vue-i18n:base:setup:json',
)?.languageOptions

// Clés construites à l'exécution (gabarit ou table de correspondance) : invisibles pour no-unused-keys.
const DYNAMIC_I18N_KEYS = [
  '/^nav\\.(home|animals)$/',
  '/^animals\\.form\\.species\\.(dog|cat)$/',
  '/^animals\\.age\\.(year|month|week)$/',
  '/^animals\\.departure\\.reasons\\.(death|rehomed|other)$/',
  '/^animals\\.departure\\.errors\\.(future|invalid)$/',
  '/^animals\\.form\\.errors\\.(name|nameMax|species|breedMax|birthDate|initialWeightKg|initialWeightKgMax)$/',
  '/^vaccinations\\.diseases\\.[a-zA-Z]+$/',
  '/^vaccinations\\.form\\.name\\.suggestions\\.combinations\\.(dog|cat)$/',
  '/^vaccinations\\.form\\.errors\\.(name|nameMax|lastInjectionDate|lastInjectionDateFuture|plannedDate|plannedDatePast)$/',
  '/^treatments\\.form\\.errors\\.(name|nameMax|type|frequency|frequencyMax|firstDoseOn|firstDoseOnTooEarly|firstDoseOnTooOld|nextDoseOn|nextDoseOnTooEarly|nextDoseOnAfterEnd|nextDoseOnAfterNextDose|nextDoseOnRefused|times|timesDuplicate|dosageQuantity|dosageIncomplete|endsOn|endsOnBeforeFirstDose|endsOnBeforeNextDose|endsOnBeforeLastDose|endsOnBeforePostponedDose|endsOnBeforeAdvancedDose|endsOnBeforeFarPostponedDose|endsOnBeforeFarAdvancedDose)$/',
  '/^treatments\\.form\\.nextDoseOn\\.refusal\\.(laterLine|laterDose|noDateLeft|noDoseBeforeEnd|arrivalLogged)$/',
  '/^treatments\\.(form\\.reminder\\.offset|detail\\.reminder\\.lessPrecise)\\.(0|15|30|60)$/',
  '/^treatments\\.shift\\.(moved|kept)\\.(weekly|every)$/',
  '/^treatments\\.shift\\.revealed\\.(help|toast)\\.(unlogged|overdue|unloggedThen|thenOverdue)$/',
  '/^treatments\\.history\\.refusal\\.(shiftLaterDose|shiftMovePastNext|shiftMoveOffRhythm)$/',
  '/^treatments\\.form\\.(submit|submitting|save|saving|resume|resuming)$/',
  '/^weight\\.form\\.errors\\.(animalId|weightKg|weightKgMax|measuredOn|measuredOnFuture)$/',
  '/^weight\\.(unit|unitName)\\.(kg|lb)$/',
  '/^settings\\.data\\.weightUnit\\.spoken\\.(kg|lb)$/',
  '/^settings\\.reminders\\.summary\\.(allowedExact|allowed|notYet|off)$/',
  '/^settings\\.reminders\\.(unasked|disabled)\\.(title|hint|action)$/',
  '/^settings\\.reminders\\.exact\\.hint\\.(allowed|pitch|off|notYetOn|notificationsOff|allowedNotYetOn|allowedNotificationsOff|offNotYetOn|offNotificationsOff)$/',
  '/^vaccinations\\.section\\.status\\.(overdue|upToDate|none)$/',
  '/^settings\\.pdf\\.status\\.(overdue|upToDate|none)$/',
  '/^treatments\\.type\\.(deworming|antiparasitic|medication)$/',
  '/^dosage\\.unit\\.(tablet|capsule|pipette|collar|ml|drop|g|sachet|spray|application|dose)$/',
  '/^treatments\\.(frequency|sheet\\.frequency|form\\.frequency\\.every|form\\.frequency\\.unit)\\.(day|week|month)$/',
  '/^home\\.reminder\\.(vaccination|firstVaccine|deworming|antiparasitic|medication)$/',
  '/^home\\.row\\.spokenType\\.(vaccination|firstVaccine|deworming|antiparasitic|medication)$/',
  '/^home\\.row\\.due\\.(overdue|today|tomorrow)$/',
  '/^vaccinations\\.sheet\\.done\\.choices\\.(oneMonth|oneYear|threeYears|otherDate|none)$/',
  '/^home\\.due\\.(overdue|today|tomorrow|later)$/',
  '/^plus\\.headline\\.(pdf|general)$/',
  '/^plus\\.benefits\\.(backup|devices|photos|pdf)$/',
  '/^plus\\.offers\\.(monthly|annual|lifetime)\\.(label|price|detail|terms|submit)$/',
  '/^plus\\.member\\.(monthly|annual|lifetime)$/',
  '/^plus\\.settings\\.status\\.(monthly|annual|lifetime|expiredMonthly|expiredAnnual)$/',
  '/^plus\\.nudge\\.(firstPhoto|carnetValue|firstExport)\\.(title|body)$/',
  '/^plus\\.(success|cancelled|failed)\\.(title|body)$/',
  '/^auth\\.form\\.errors\\.(emailRequired|emailInvalid|passwordRequired|passwordTooShort)$/',
  '/^auth\\.errors\\.(emailTaken|invalidCredentials|weakPassword|emailNotConfirmed|offline|noGoogleAccount|googleUnavailable|unknown)$/',
]

export const vueI18nRulesBlock = {
  name: 'app/vue-i18n-rules',
  files: ['**/*.{vue,ts,mts,tsx}'],
  plugins: { '@intlify/vue-i18n': pluginVueI18n },
  settings: VUE_I18N_SETTINGS,
  rules: {
    '@intlify/vue-i18n/no-missing-keys': 'error',
    '@intlify/vue-i18n/no-raw-text': [
      'error',
      {
        ignorePattern: '^[\\s\\d.,:;·/%—…*+×()#&-]*$',
        attributes: {
          '/.+/': ['title', 'aria-label', 'alt', 'placeholder', 'label', 'text', 'hint'],
        },
      },
    ],
  },
} satisfies Omit<Linter.Config, 'plugins'> & { plugins: object }

export const vueI18nLocalesBlock = {
  name: 'app/vue-i18n-locales',
  files: [LOCALE_FILES],
  plugins: { '@intlify/vue-i18n': pluginVueI18n },
  languageOptions: VUE_I18N_JSON_PARSER,
  settings: VUE_I18N_SETTINGS,
  rules: {
    '@typescript-eslint/consistent-type-imports': 'off',
    '@intlify/vue-i18n/valid-message-syntax': 'error',
    '@intlify/vue-i18n/no-missing-keys-in-other-locales': 'error',
    '@intlify/vue-i18n/no-unused-keys': [
      'error',
      { src: './src', extensions: ['.ts', '.vue'], ignores: DYNAMIC_I18N_KEYS },
    ],
  },
} satisfies Omit<Linter.Config, 'plugins'> & { plugins: object }
