<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { PaidPlan, PlusOffer } from './billing.service'
import { MANAGE_SUBSCRIPTIONS_URL } from './google-play'
import { usePurchaseStore } from './purchase.store'
import PushedScreen from '@/shared/PushedScreen.vue'
import { showToast } from '@/shared/toast'

type Phase = 'offers' | 'purchasing' | 'restoring' | 'success' | 'cancelled' | 'failed'

const PLAN_ORDER = ['annual', 'monthly', 'lifetime'] as const satisfies readonly PaidPlan[]

const BENEFITS = [
  { key: 'backup', icon: 'ms:cloud_done' },
  { key: 'devices', icon: 'ms:devices' },
  { key: 'photos', icon: 'ms:photo_camera' },
  { key: 'pdf', icon: 'ms:picture_as_pdf' },
] as const

const FREE_ITEMS = ['animals', 'reminders', 'weight', 'export'] as const
const COMPARISON_ROWS = ['backup', 'photos', 'restore'] as const

const { t } = useI18n()
const router = useRouter()
const purchase = usePurchaseStore()

const phase = ref<Phase>('offers')
const selected = ref<PaidPlan>('annual')

const offers = computed(() =>
  PLAN_ORDER.flatMap((plan) => purchase.offers.filter((offer) => offer.plan === plan)),
)
const isMember = computed(() => purchase.status.plan !== 'none')
const canRetryOffers = computed(() => purchase.available && offers.value.length === 0)
const isPurchasing = computed(() => phase.value === 'purchasing')
const isRestoring = computed(() => phase.value === 'restoring')
const isBusy = computed(() => isPurchasing.value || isRestoring.value)
const isDone = computed(() => ['success', 'cancelled', 'failed'].includes(phase.value))
const selectedOffer = computed(
  () => offers.value.find((offer) => offer.plan === selected.value) ?? null,
)
const submitLabel = computed(() => {
  const offer = selectedOffer.value
  if (!offer) return ''
  return t(`plus.offers.${offer.plan}.submit`, { price: priceOf(offer) })
})

function priceOf(offer: PlusOffer): string {
  return t(`plus.offers.${offer.plan}.price`, { price: offer.priceString })
}

onMounted(() => {
  if (!isMember.value) void loadOffers()
})

async function loadOffers(): Promise<void> {
  await purchase.loadOffers()
  if (!offers.value.some((offer) => offer.plan === selected.value)) {
    selected.value = offers.value[0]?.plan ?? 'annual'
  }
}

function close(): void {
  router.back()
}

async function buy(): Promise<void> {
  if (isBusy.value) return
  phase.value = 'purchasing'
  try {
    const outcome = await purchase.purchase(selected.value)
    phase.value = outcome.kind === 'purchased' ? 'success' : 'cancelled'
  } catch {
    phase.value = 'failed'
  }
}

function leaveOutcome(): void {
  if (phase.value === 'success') close()
  else phase.value = 'offers'
}

async function restore(): Promise<void> {
  if (isBusy.value) return
  phase.value = 'restoring'
  try {
    const status = await purchase.restore()
    if (status.plan === 'none') {
      phase.value = 'offers'
      showToast(t('plus.restore.none'))
    } else {
      phase.value = 'success'
    }
  } catch {
    phase.value = 'offers'
    showToast(t('plus.restore.failed'))
  }
}
</script>

<template>
  <PushedScreen class="plus" :title="t('plus.title')" :back-label="t('form.back')" @back="close">
    <div v-if="isDone" class="plus-outcome">
      <span class="plus-outcome__icon" :class="`plus-outcome__icon--${phase}`">
        <v-icon :icon="phase === 'success' ? 'ms:check_circle' : 'ms:info'" size="40" />
      </span>
      <h2 class="plus-outcome__title">{{ t(`plus.${phase}.title`) }}</h2>
      <!-- #83 : rétablir « Envoi de ton carnet vers le cloud… » puis « Carnet sauvegardé. Tu es tranquille. » -->
      <p class="plus-outcome__body">{{ t(`plus.${phase}.body`) }}</p>

      <v-btn
        class="plus-outcome__primary"
        :variant="phase === 'success' ? 'outlined' : 'flat'"
        color="primary"
        @click="leaveOutcome"
      >
        {{ phase === 'success' ? t('plus.success.back') : t('plus.retry') }}
      </v-btn>
      <v-btn
        v-if="phase !== 'success'"
        class="plus-outcome__secondary"
        variant="text"
        color="primary"
        @click="close"
      >
        {{ t('plus.later') }}
      </v-btn>
    </div>

    <div v-else-if="isMember" class="plus-member">
      <span class="plus-member__icon">
        <v-icon icon="ms:workspace_premium" size="40" />
      </span>
      <h2 class="plus-member__title">{{ t('plus.member.title') }}</h2>
      <p class="plus-member__status">{{ t(`plus.member.${purchase.status.plan}`) }}</p>

      <a
        class="plus-member__manage"
        :href="MANAGE_SUBSCRIPTIONS_URL"
        target="_blank"
        rel="noopener"
      >
        {{ t('plus.terms.manage') }}
        <v-icon icon="ms:open_in_new" size="16" />
      </a>
      <v-btn class="plus-member__close" variant="outlined" color="primary" @click="close">
        {{ t('plus.success.back') }}
      </v-btn>
    </div>

    <div v-else class="plus__content">
      <div class="plus__hero">
        <span class="plus__hero-icon">
          <v-icon icon="ms:workspace_premium" size="38" />
        </span>
        <h2 class="plus__headline">{{ t('plus.headline') }}</h2>
        <p class="plus__subtitle">{{ t('plus.subtitle') }}</p>
      </div>

      <ul class="plus__benefits">
        <li v-for="benefit in BENEFITS" :key="benefit.key" class="plus__benefit">
          <v-icon :icon="benefit.icon" size="20" />
          <span>{{ t(`plus.benefits.${benefit.key}`) }}</span>
        </li>
      </ul>

      <section class="plus__card plus__free">
        <h3 class="plus__free-title">{{ t('plus.free.title') }}</h3>
        <ul class="plus__free-list">
          <li v-for="item in FREE_ITEMS" :key="item" class="plus__free-item">
            <v-icon icon="ms:check" size="18" />
            <span>{{ t(`plus.free.${item}`) }}</span>
          </li>
        </ul>
      </section>

      <section class="plus__card plus__comparison">
        <h3 class="plus__comparison-title">{{ t('plus.comparison.title') }}</h3>
        <table class="plus__comparison-table" role="table">
          <thead role="rowgroup">
            <tr class="plus__comparison-head" role="row">
              <td class="plus__comparison-corner" role="cell"></td>
              <th role="columnheader" scope="col">{{ t('plus.comparison.android') }}</th>
              <th role="columnheader" scope="col">{{ t('plus.comparison.plus') }}</th>
            </tr>
          </thead>
          <tbody role="rowgroup">
            <tr v-for="row in COMPARISON_ROWS" :key="row" class="plus__comparison-row" role="row">
              <th role="rowheader" scope="row" class="plus__comparison-label">
                {{ t(`plus.comparison.${row}.label`) }}
              </th>
              <td role="cell" class="plus__comparison-android">
                {{ t(`plus.comparison.${row}.android`) }}
              </td>
              <td role="cell" class="plus__comparison-plus">
                {{ t(`plus.comparison.${row}.plus`) }}
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section class="plus__offers">
        <h3 v-if="offers.length > 0" id="plus-offers-title" class="plus__offers-title">
          {{ t('plus.offers.title') }}
        </h3>

        <div v-if="offers.length > 0" role="radiogroup" aria-labelledby="plus-offers-title">
          <button
            v-for="offer in offers"
            :key="offer.plan"
            type="button"
            role="radio"
            class="plus-offer"
            :class="{
              'plus-offer--selected': selected === offer.plan,
              'plus-offer--best': offer.plan === 'annual',
            }"
            :aria-checked="selected === offer.plan"
            :disabled="isBusy"
            @click="selected = offer.plan"
          >
            <span class="plus-offer__head">
              <span class="plus-offer__label">{{ t(`plus.offers.${offer.plan}.label`) }}</span>
              <span v-if="offer.plan === 'annual'" class="plus-offer__badge">
                {{ t('plus.offers.best') }}
              </span>
            </span>
            <span class="plus-offer__price">{{ priceOf(offer) }}</span>
            <span v-if="offer.plan === 'annual'" class="plus-offer__saving">
              {{ t('plus.offers.annual.saving') }}
            </span>
            <span class="plus-offer__terms">{{ t(`plus.offers.${offer.plan}.terms`) }}</span>
          </button>
        </div>

        <p v-else class="plus__unavailable">{{ t('plus.offers.unavailable') }}</p>

        <v-btn
          v-if="offers.length > 0"
          class="plus__submit"
          variant="flat"
          color="primary"
          :loading="isPurchasing"
          :disabled="isBusy"
          @click="buy"
        >
          {{ submitLabel }}
        </v-btn>
        <v-btn
          v-else-if="canRetryOffers"
          class="plus__retry-offers"
          variant="outlined"
          color="primary"
          @click="loadOffers"
        >
          {{ t('plus.offers.retry') }}
        </v-btn>
      </section>

      <div class="plus__terms">
        <p class="plus__terms-free">{{ t('plus.terms.free') }}</p>
        <p class="plus__terms-prices">{{ t('plus.terms.prices') }}</p>
        <p class="plus__terms-local">{{ t('plus.terms.local') }}</p>
        <a class="plus__manage" :href="MANAGE_SUBSCRIPTIONS_URL" target="_blank" rel="noopener">
          {{ t('plus.terms.manage') }}
          <v-icon icon="ms:open_in_new" size="16" />
        </a>
      </div>

      <v-btn
        v-if="purchase.available"
        class="plus__restore"
        variant="text"
        color="primary"
        :loading="isRestoring"
        :disabled="isBusy"
        @click="restore"
      >
        {{ t('plus.restore.action') }}
      </v-btn>
    </div>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.plus__content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 8px 20px 36px;
}

.plus__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.plus__hero-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 76px;
  height: 76px;
  margin-bottom: 18px;
  border-radius: 50%;
  background: tokens.$color-priming-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.plus__headline {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 23px;
  font-weight: 700;
  line-height: 1.25;
}

.plus__subtitle {
  max-width: 320px;
  margin: 10px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
  line-height: 1.55;
}

.plus__benefits {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.plus__benefit {
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.plus__card {
  padding: 18px 20px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
}

.plus__free-title,
.plus__comparison-title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 15px;
  font-weight: 700;
}

.plus__free-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}

.plus__free-item {
  display: flex;
  align-items: center;
  gap: 10px;
  color: tokens.$color-text-secondary;
  font-size: 13.5px;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

// `display: contents` : la maquette pose le libellé sur toute la largeur et ses
// deux valeurs dessous, ce qu'aucune colonne de tableau ne sait faire.
.plus__comparison-table {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 12px;
  width: 100%;
  margin-top: 14px;

  thead,
  tbody,
  tr {
    display: contents;
  }
}

.plus__comparison-head th {
  padding-bottom: 6px;
  color: tokens.$color-hint;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: start;
  text-transform: uppercase;
}

.plus__comparison-corner {
  display: none;
}

.plus__comparison-label {
  grid-column: 1 / -1;
  margin-top: 12px;
  padding-top: 12px;
  padding-bottom: 4px;
  border-top: 1px solid tokens.$color-divider;
  font-size: 13.5px;
  font-weight: 600;
  text-align: start;
}

.plus__comparison-row:first-child .plus__comparison-label {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}

.plus__comparison-android,
.plus__comparison-plus {
  font-size: 13px;
}

.plus__comparison-android {
  color: tokens.$color-text-secondary;
}

.plus__comparison-plus {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
}

.plus__offers-title {
  margin: 0 0 14px;
  font-family: tokens.$font-family-heading;
  font-size: 18px;
  font-weight: 700;
}

.plus-offer {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: 100%;
  padding: 16px 18px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-tile;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-family: inherit;
  text-align: start;
  cursor: pointer;
}

.plus-offer + .plus-offer {
  margin-top: 12px;
}

// `rgba(…, alpha)` et non `rgb(… / alpha)` : le thème livre « 1,56,62 », que la
// syntaxe à barre oblique rejette, et la bordure retombait alors sur `currentColor`.
.plus-offer--best {
  border-color: rgba(var(--v-theme-primary), 0.18);
}

.plus-offer--selected {
  border-color: rgb(var(--v-theme-primary));
  background: tokens.$color-choice-selected-surface;
}

.plus-offer__head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.plus-offer__label {
  font-size: 14.5px;
  font-weight: 700;
}

.plus-offer__badge {
  padding: 2px 9px;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  color: tokens.$color-on-primary;
  font-size: 11px;
  font-weight: 700;
}

.plus-offer__price {
  font-family: tokens.$font-family-heading;
  font-size: 20px;
  font-weight: 700;
}

.plus-offer__saving {
  color: rgb(var(--v-theme-primary));
  font-size: 12.5px;
  font-weight: 700;
}

.plus-offer__terms {
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
  line-height: 1.45;
}

.plus__unavailable {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 13.5px;
  line-height: 1.5;
}

.plus__submit,
.plus__retry-offers {
  width: 100%;
  height: auto;
  min-height: 52px;
  margin-top: 18px;
  padding-block: 12px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

// Le libellé porte le prix rendu par Google Play : aucune devise ne doit déborder.
.plus__submit :deep(.v-btn__content) {
  overflow-wrap: anywhere;
  white-space: normal;
}

.plus__terms {
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
  line-height: 1.5;

  p {
    margin: 0;
  }
}

.plus__manage {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
  text-decoration: none;

  @include tap.tap-target;
}

.plus__restore {
  align-self: center;
  height: 44px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;

  @include tap.tap-target;
}

.plus-member {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: 32px 24px;
  text-align: center;
}

.plus-member__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  margin-bottom: 24px;
  border-radius: 50%;
  background: tokens.$color-priming-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.plus-member__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 23px;
  font-weight: 700;
  line-height: 1.25;
}

.plus-member__status {
  margin: 10px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
  line-height: 1.55;
}

.plus-member__manage {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 24px;
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
  text-decoration: none;

  @include tap.tap-target;
}

.plus-member__close {
  width: 100%;
  max-width: 320px;
  height: 52px;
  margin-top: 20px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.plus-outcome {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 70vh;
  padding: 32px 24px;
  text-align: center;
}

.plus-outcome__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  margin-bottom: 24px;
  border-radius: 50%;
  background: tokens.$color-reminders-off-surface;
  color: tokens.$color-text-secondary;
}

.plus-outcome__icon--success {
  background: tokens.$color-priming-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.plus-outcome__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 23px;
  font-weight: 700;
  line-height: 1.25;
}

.plus-outcome__body {
  max-width: 320px;
  margin: 10px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
  line-height: 1.55;
}

.plus-outcome__primary {
  width: 100%;
  max-width: 320px;
  height: 52px;
  margin-top: 28px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.plus-outcome__secondary {
  height: 44px;
  margin-top: 8px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;

  @include tap.tap-target;
}
</style>
