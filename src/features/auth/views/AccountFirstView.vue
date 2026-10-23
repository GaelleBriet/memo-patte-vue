<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useGoogleSignIn } from '../composables/use-google-sign-in'
import { accountFirstOffer, leavesAccountFirst } from '../logic/account-first'
import { ACCOUNT_FIRST_ORIGIN } from '../logic/sign-up-access'
import { useAuthStore } from '../store/auth.store'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { returnTo } from '@/shared/utils/return-to'
import { signInRoute } from '@/shared/utils/sign-in-route'

import AccountLegalNotice from './AccountLegalNotice.vue'
import GoogleSignInButton from './GoogleSignInButton.vue'

const PLUS_ROUTE = { name: 'plus' }

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const purchase = usePurchaseStore()
const { continueWithGoogle } = useGoogleSignIn()

const isGoogleSignIn = ref(false)
const failureKey = ref<string | null>(null)
const errorBanner = useTemplateRef<HTMLElement>('errorBanner')

let isMounted = true

const offer = computed(() => accountFirstOffer(purchase.pendingCheckout, purchase.offers))
const isLeaving = computed(() => leavesAccountFirst(auth.hasPlusAccount, offer.value))
const offerLabel = computed(() => {
  if (!offer.value) return ''
  const { plan, priceString } = offer.value
  return t(`auth.accountFirst.offer.${plan}`, {
    price: t(`plus.offers.${plan}.price`, { price: priceString }),
  })
})

function backToPlus(): void {
  returnTo(router, PLUS_ROUTE)
}

function continueWithEmail(): void {
  void router.push(signInRoute(ACCOUNT_FIRST_ORIGIN, { signUp: true }))
}

function signIn(): void {
  void router.push(signInRoute(ACCOUNT_FIRST_ORIGIN))
}

async function signInWithGoogle(): Promise<void> {
  if (isGoogleSignIn.value) return
  isGoogleSignIn.value = true
  failureKey.value = null

  const result = await continueWithGoogle()
  if (!isMounted) return
  if (result.kind === 'signed-in') {
    backToPlus()
    return
  }
  isGoogleSignIn.value = false
  if (result.kind === 'failed') {
    failureKey.value = result.messageKey
    await nextTick()
    errorBanner.value?.focus()
  }
}

onMounted(() => {
  if (isLeaving.value) backToPlus()
})

onUnmounted(() => {
  isMounted = false
})
</script>

<template>
  <PushedScreen
    class="account-first"
    :title="t('auth.accountFirst.title')"
    :back-label="t('auth.accountFirst.close')"
    back-icon="ms:close"
    :aria-busy="isGoogleSignIn"
    @back="backToPlus"
  >
    <template v-if="!isLeaving">
      <div v-if="isGoogleSignIn" class="account-first__loading" role="status">
        <v-progress-circular indeterminate color="primary" :size="34" :width="3" />
        <p class="account-first__loading-label">{{ t('auth.signIn.loading') }}</p>
      </div>

      <div v-else class="account-first__content">
        <div class="account-first__hero">
          <span class="account-first__hero-icon">
            <v-icon icon="ms:account_circle" size="30" />
          </span>
          <h2 class="account-first__headline">{{ t('auth.accountFirst.headline') }}</h2>
          <p class="account-first__body">{{ t('auth.accountFirst.body') }}</p>
        </div>

        <div class="account-first__offer">
          <v-icon icon="ms:star" size="24" />
          <div class="account-first__offer-text">
            <p class="account-first__offer-name">{{ offerLabel }}</p>
            <p class="account-first__offer-payment">{{ t('auth.accountFirst.payment') }}</p>
          </div>
        </div>

        <p
          v-if="failureKey"
          ref="errorBanner"
          class="account-first__error"
          role="alert"
          tabindex="-1"
        >
          <v-icon icon="ms:error" size="18" aria-hidden="true" />
          <span>{{ t(failureKey) }}</span>
        </p>

        <GoogleSignInButton :label="t('auth.google.continue')" @click="signInWithGoogle" />

        <v-btn
          class="account-first__email"
          variant="outlined"
          color="primary"
          prepend-icon="ms:mail"
          @click="continueWithEmail"
        >
          {{ t('auth.accountFirst.email') }}
        </v-btn>

        <v-btn class="account-first__sign-in" variant="text" color="primary" @click="signIn">
          {{ t('auth.accountFirst.signIn') }}
        </v-btn>

        <AccountLegalNotice centered />
      </div>
    </template>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.account-first__content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 18px 32px;
}

.account-first__hero {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 8px;
}

.account-first__hero-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: tokens.$color-notice-surface;
  color: rgb(var(--v-theme-primary));
}

.account-first__headline {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
  text-wrap: pretty;
}

.account-first__body {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 15px;
  line-height: 1.5;
  text-wrap: pretty;
}

.account-first__offer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid tokens.$color-priming-icon-surface;
  border-radius: 18px;
  background: tokens.$color-notice-surface;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.account-first__offer-text {
  flex: 1 1 auto;
  min-width: 0;
}

.account-first__offer-name {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.account-first__offer-payment {
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
  line-height: 1.4;
}

.account-first__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid rgb(var(--v-theme-error));
  border-radius: tokens.$radius-notice;
  background: rgb(var(--v-theme-error-container));
  color: rgb(var(--v-theme-on-error-container));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.4;

  &:focus {
    outline: none;
  }

  .v-icon {
    flex: 0 0 auto;
    margin-top: 1px;
    color: rgb(var(--v-theme-error));
  }
}

.account-first__email {
  height: 50px;
  border-width: 1.5px;
  border-radius: tokens.$radius-pill;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.account-first__sign-in {
  height: 44px;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
  white-space: normal;

  @include tap.tap-target;
}

.account-first__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  min-height: 60vh;
  min-height: 60dvh;
  padding: 32px 24px;
}

.account-first__loading-label {
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
}
</style>
