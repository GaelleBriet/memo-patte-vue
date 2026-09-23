<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import type { PaidPlan, PlusOffer } from '../service/billing.service'
import { MANAGE_SUBSCRIPTIONS_URL } from '../logic/google-play'
import {
  checkoutBar,
  orderedOffers,
  pitchBenefits,
  plusOriginOf,
  selectablePlan,
  type PlusBenefit,
} from '../logic/plus-paywall'
import { usePurchaseStore } from '../store/purchase.store'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { showToast } from '@/shared/utils/toast'

type Phase = 'offers' | 'purchasing' | 'restoring' | 'success' | 'cancelled' | 'failed'

const BENEFIT_ICONS: Record<PlusBenefit, string> = {
  backup: 'ms:cloud_done',
  devices: 'ms:devices',
  photos: 'ms:photo_camera',
  pdf: 'ms:picture_as_pdf',
}

const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const purchase = usePurchaseStore()

const phase = ref<Phase>('offers')
const selected = ref<PaidPlan>('annual')
const isLoadingOffers = ref(false)
const hasAnswered = ref(false)

const origin = computed(() => plusOriginOf(route.query.from))
const heroIcon = computed(() =>
  origin.value === 'pdf' ? 'ms:picture_as_pdf' : 'ms:workspace_premium',
)
const benefits = computed(() => pitchBenefits(origin.value))
const offers = computed(() => orderedOffers(purchase.offers))
const bar = computed(() =>
  checkoutBar({
    offers: offers.value,
    selected: selected.value,
    loading: isLoadingOffers.value,
    answered: hasAnswered.value,
  }),
)
const isConnecting = computed(
  () => bar.value.kind === 'connecting' || (bar.value.kind === 'unavailable' && bar.value.retrying),
)
const isMember = computed(() => purchase.status.plan !== 'none')
const isPurchasing = computed(() => phase.value === 'purchasing')
const isRestoring = computed(() => phase.value === 'restoring')
const isBusy = computed(() => isPurchasing.value || isRestoring.value)
const isDone = computed(() => ['success', 'cancelled', 'failed'].includes(phase.value))

function priceOf(offer: PlusOffer): string {
  return t(`plus.offers.${offer.plan}.price`, { price: offer.priceString })
}

function disclosureOf(offer: PlusOffer): string {
  return t(`plus.offers.${offer.plan}.terms`, { price: offer.priceString })
}

function submitLabelOf(offer: PlusOffer): string {
  return t(`plus.offers.${offer.plan}.submit`, { price: priceOf(offer) })
}

onMounted(() => {
  if (!isMember.value) void loadOffers()
})

async function loadOffers(): Promise<void> {
  if (isLoadingOffers.value) return
  isLoadingOffers.value = true
  await purchase.loadOffers()
  isLoadingOffers.value = false
  hasAnswered.value = true
  selected.value = selectablePlan(offers.value, selected.value)
}

function close(): void {
  router.back()
}

async function buy(plan: PaidPlan): Promise<void> {
  if (isBusy.value) return
  phase.value = 'purchasing'
  try {
    const outcome = await purchase.purchase(plan)
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
          <v-icon :icon="heroIcon" size="23" />
        </span>
        <h2 class="plus__headline">{{ t(`plus.headline.${origin}`) }}</h2>
        <p class="plus__subtitle">{{ t('plus.subtitle') }}</p>
      </div>

      <ul class="plus__benefits">
        <li
          v-for="item in benefits"
          :key="item.benefit"
          class="plus__benefit"
          :class="{ 'plus__benefit--highlighted': item.highlighted }"
        >
          <span class="plus__benefit-icon">
            <v-icon :icon="BENEFIT_ICONS[item.benefit]" size="16" />
          </span>
          <span>{{ t(`plus.benefits.${item.benefit}`) }}</span>
        </li>
      </ul>

      <div
        v-if="offers.length > 0"
        class="plus__offers"
        role="radiogroup"
        :aria-label="t('plus.offers.title')"
      >
        <button
          v-for="offer in offers"
          :key="offer.plan"
          type="button"
          role="radio"
          class="plus-offer"
          :class="{ 'plus-offer--selected': selected === offer.plan }"
          :aria-checked="selected === offer.plan"
          :disabled="isBusy"
          @click="selected = offer.plan"
        >
          <span class="plus-offer__radio" aria-hidden="true" />
          <span class="plus-offer__text">
            <span class="plus-offer__head">
              <span class="plus-offer__label">{{ t(`plus.offers.${offer.plan}.label`) }}</span>
              <span v-if="offer.plan === 'annual'" class="plus-offer__badge">
                {{ t('plus.offers.best') }}
              </span>
            </span>
            <span class="plus-offer__detail">{{ t(`plus.offers.${offer.plan}.detail`) }}</span>
          </span>
          <span class="plus-offer__price">{{ priceOf(offer) }}</span>
        </button>
      </div>

      <p v-else class="plus__pending">
        <v-icon icon="ms:storefront" size="22" />
        <span>{{ t('plus.offers.pending') }}</span>
      </p>

      <p class="plus__android">
        <v-icon icon="ms:info" size="18" />
        <span>{{ t('plus.android') }}</span>
      </p>

      <div class="plus__links">
        <v-btn
          v-if="purchase.available"
          class="plus__restore"
          variant="text"
          color="primary"
          :loading="isRestoring"
          :disabled="isBusy"
          @click="restore"
        >
          {{ t('plus.restore.purchases') }}
        </v-btn>
        <a class="plus__manage" :href="MANAGE_SUBSCRIPTIONS_URL" target="_blank" rel="noopener">
          {{ t('plus.terms.manage') }}
          <v-icon icon="ms:open_in_new" size="15" />
        </a>
      </div>

      <p class="plus__terms">{{ t('plus.terms.prices') }} {{ t('plus.terms.local') }}</p>
    </div>

    <template v-if="!isDone && !isMember" #actions>
      <div class="plus__checkout">
        <template v-if="bar.kind === 'offer'">
          <p class="plus__disclosure">{{ disclosureOf(bar.offer) }}</p>
          <v-btn
            class="plus__submit"
            variant="flat"
            color="primary"
            :loading="isPurchasing"
            :disabled="isBusy"
            @click="buy(bar.offer.plan)"
          >
            {{ submitLabelOf(bar.offer) }}
          </v-btn>
        </template>

        <template v-else>
          <div v-if="bar.kind === 'unavailable'" class="plus__unavailable" role="status">
            <v-icon icon="ms:cloud_off" size="20" />
            <div>
              <p class="plus__unavailable-title">{{ t('plus.offers.unavailable.title') }}</p>
              <p class="plus__unavailable-hint">{{ t('plus.offers.unavailable.hint') }}</p>
            </div>
          </div>
          <v-btn
            class="plus__retry-offers"
            variant="flat"
            color="primary"
            :aria-busy="isConnecting"
            @click="loadOffers"
          >
            <v-progress-circular
              v-if="isConnecting"
              class="plus__retry-spinner"
              indeterminate
              :size="15"
              :width="2"
            />
            {{ isConnecting ? t('plus.offers.connecting') : t('plus.offers.retry') }}
          </v-btn>
        </template>
      </div>
    </template>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.plus__content {
  display: flex;
  flex-direction: column;
  padding: 16px 22px 24px;
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
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: tokens.$color-priming-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.plus__headline {
  max-width: 290px;
  margin: 10px 0 0;
  font-family: tokens.$font-family-heading;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.015em;
  text-wrap: balance;
}

.plus__subtitle {
  max-width: 290px;
  margin: 6px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
  line-height: 1.45;
  text-wrap: pretty;
}

.plus__benefits {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 16px 0 0;
  padding: 0;
  list-style: none;
}

.plus__benefit {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-block: 3px;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
}

.plus__benefit-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: tokens.$color-priming-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.plus__benefit--highlighted {
  margin-inline: -10px;
  padding: 6px 10px;
  border-radius: tokens.$radius-field;
  background: tokens.$color-plus-highlight-surface;
  color: rgb(var(--v-theme-primary));
  font-weight: 700;

  .plus__benefit-icon {
    background: rgb(var(--v-theme-primary));
    color: tokens.$color-on-primary;
  }
}

.plus__offers {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 18px;
}

.plus-offer {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 14px;
  border: 1.5px solid tokens.$color-card-border;
  border-radius: tokens.$radius-notice;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-family: inherit;
  line-height: 1.2;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
  }
}

.plus-offer--selected {
  border-color: rgb(var(--v-theme-primary));
  background: tokens.$color-choice-selected-surface;
}

.plus-offer__radio {
  flex: 0 0 auto;
  box-sizing: border-box;
  width: 20px;
  height: 20px;
  border: 2px solid tokens.$color-offer-radio-border;
  border-radius: 50%;
}

.plus-offer--selected .plus-offer__radio {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
  box-shadow: inset 0 0 0 3px tokens.$color-choice-selected-surface;
}

.plus-offer__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.plus-offer__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.plus-offer__label {
  font-size: 14px;
  font-weight: 700;
}

.plus-offer__badge {
  padding: 2px 8px;
  border-radius: tokens.$radius-pill;
  background: rgb(var(--v-theme-primary));
  color: tokens.$color-on-primary;
  font-size: 12px;
  font-weight: 700;
}

.plus-offer__detail {
  margin-top: 2px;
  color: tokens.$color-text-secondary;
  font-size: 12px;
  font-weight: 500;
}

.plus-offer__price {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
  font-family: tokens.$font-family-heading;
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
}

.plus__pending,
.plus__android {
  display: flex;
  margin: 18px 0 0;
  border-radius: tokens.$radius-notice;
  line-height: 1.45;
}

.plus__pending {
  align-items: center;
  gap: 12px;
  padding: 18px 16px;
  border: 1px dashed tokens.$color-card-border;
  background: rgb(var(--v-theme-surface));
  color: tokens.$color-text-secondary;
  font-size: 13px;
  font-weight: 500;

  .v-icon {
    flex: 0 0 auto;
    color: tokens.$color-text-meta;
  }
}

.plus__android {
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  background: tokens.$color-notice-surface;
  font-size: 12.5px;
  font-weight: 500;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.plus__links {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 14px;
}

.plus__restore,
.plus__manage {
  position: relative;
  height: 44px;
  font-size: 13.5px;
  font-weight: 600;
  letter-spacing: normal;

  @include tap.tap-target;
}

.plus__manage {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: rgb(var(--v-theme-primary));
  text-decoration: none;
}

.plus__terms {
  margin: 4px 8px 0;
  color: tokens.$color-hint;
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
}

.plus__checkout {
  padding: 12px 20px tokens.$padding-bottom-nav;
}

.plus__disclosure {
  margin: 0 0 10px;
  color: tokens.$color-text-secondary;
  font-size: 12px;
  line-height: 1.4;
  text-wrap: pretty;
}

.plus__unavailable {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;

  .v-icon {
    flex: 0 0 auto;
    color: tokens.$color-text-secondary;
  }

  p {
    margin: 0;
  }
}

.plus__unavailable-title {
  font-size: 13.5px;
  font-weight: 700;
}

.plus__unavailable-hint {
  margin-top: 1px;
  color: tokens.$color-text-secondary;
  font-size: 12px;
}

.plus__submit,
.plus__retry-offers {
  width: 100%;
  height: auto;
  min-height: 52px;
  padding: 12px;
  border-radius: tokens.$radius-pill;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: normal;
}

.plus__retry-offers :deep(.v-btn__content) {
  gap: 10px;
}

// Le libellé porte le prix rendu par Google Play : aucune devise ne doit déborder.
.plus__submit :deep(.v-btn__content) {
  overflow-wrap: anywhere;
  white-space: normal;
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
