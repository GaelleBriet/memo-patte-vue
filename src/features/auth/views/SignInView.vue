<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useEmailCode } from '../composables/use-email-code'
import { useGoogleSignIn } from '../composables/use-google-sign-in'
import { useSignedInExit } from '../composables/use-signed-in-exit'
import { AccountError } from '../logic/account-error'
import { signInErrorKey } from '../logic/account-error-message'
import { useAuthStore } from '../store/auth.store'
import { emptySignInFormValues, validateSignInForm, type SignInMode } from '../logic/sign-in-form'
import { initialSignInMode, offersSignUp } from '../logic/sign-up-access'
import { focusFirstInvalid } from '@/shared/form/focus-first-invalid'
import FormField from '@/shared/form/FormField.vue'
import { useFormValidation } from '@/shared/form/use-form-validation'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { showToast } from '@/shared/utils/toast'
import { passwordResetRoute } from '@/shared/utils/sign-in-route'

import AccountLegalNotice from './AccountLegalNotice.vue'
import EmailCodeStep from './EmailCodeStep.vue'
import GoogleSignInButton from './GoogleSignInButton.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const route = useRoute()
const { continueWithGoogle } = useGoogleSignIn()
const emailCode = useEmailCode()

const mode = ref<SignInMode>(initialSignInMode(route.query))
const values = ref(emptySignInFormValues())

const { errors, validate, reset } = useFormValidation(values, (current) =>
  validateSignInForm(current, mode.value),
)

const isSubmitting = ref(false)
const isGoogleSignIn = ref(false)
const failureKey = ref<string | null>(null)
const fields = useTemplateRef<HTMLElement>('fields')
const errorBanner = useTemplateRef<HTMLElement>('errorBanner')

const { hasNoAnswer, leave, leaveSignedIn, retryCheck } = useSignedInExit(isSubmitting)

let isMounted = true

const isSignUp = computed(() => mode.value === 'sign-up')
const canSignUp = computed(() => offersSignUp(route.query))
const isCodeStep = computed(() => emailCode.email.value !== null)
const title = computed(() => {
  if (isCodeStep.value) return t('auth.code.title')
  return isSignUp.value ? t('auth.signUp.title') : t('auth.signIn.title')
})
const submitLabel = computed(() =>
  isSignUp.value ? t('auth.signUp.submit') : t('auth.signIn.submit'),
)
const loadingLabel = computed(() =>
  isSignUp.value && !isGoogleSignIn.value ? t('auth.signUp.loading') : t('auth.signIn.loading'),
)
const toggleLabel = computed(() =>
  isSignUp.value ? t('auth.signUp.toggle') : t('auth.signIn.toggle'),
)
const toggleAction = computed(() =>
  isSignUp.value ? t('auth.signUp.toggleAction') : t('auth.signIn.toggleAction'),
)
const passwordAutocomplete = computed(() => (isSignUp.value ? 'new-password' : 'current-password'))
const passwordHelp = computed(() =>
  isSignUp.value && !errors.value.password ? t('auth.password.help') : null,
)

function toggleMode(): void {
  mode.value = isSignUp.value ? 'sign-in' : 'sign-up'
  failureKey.value = null
  reset()
}

function openPasswordReset(): void {
  void router.push(passwordResetRoute(route.query, values.value.email.trim()))
}

function back(): void {
  if (isCodeStep.value) backToForm()
  else leave()
}

function backToForm(): void {
  const { email, origin } = emailCode.close()
  values.value = { ...emptySignInFormValues(), email }
  mode.value = origin
  failureKey.value = null
  reset()
}

async function openCodeAfterSignIn(email: string): Promise<void> {
  const opened = await emailCode.afterUnconfirmedSignIn(email)
  if (!isMounted) return
  isSubmitting.value = false
  if (opened.kind === 'failed') await showFailure(opened.messageKey)
}

async function confirmCode(): Promise<void> {
  if (isSubmitting.value || !emailCode.isComplete.value) return
  isSubmitting.value = true
  const confirmed = await emailCode.confirm()
  if (!isMounted) return
  if (confirmed) await leaveSignedIn()
  else isSubmitting.value = false
}

async function resendCode(): Promise<void> {
  const email = emailCode.email.value
  if ((await emailCode.resend()) === 'sent' && isMounted) {
    showToast(t('auth.code.sent', { email }))
  }
}

async function showFailure(messageKey: string): Promise<void> {
  failureKey.value = messageKey
  await nextTick()
  errorBanner.value?.focus()
}

async function submit(): Promise<void> {
  if (isSubmitting.value) return

  const result = validate()
  if (!result.success) {
    await nextTick()
    if (fields.value) focusFirstInvalid(fields.value)
    return
  }

  const { email, password } = result.data
  isSubmitting.value = true
  failureKey.value = null

  try {
    let toConfirm = false
    if (isSignUp.value) {
      toConfirm = (await auth.signUp(email, password)) === 'confirmation-pending'
    } else {
      await auth.signIn(email, password)
    }
    if (!isMounted) return
    if (toConfirm) {
      isSubmitting.value = false
      emailCode.afterSignUp(email)
    } else await leaveSignedIn()
  } catch (cause) {
    if (!isMounted) return
    if (cause instanceof AccountError && cause.reason === 'email-not-confirmed') {
      await openCodeAfterSignIn(email)
      return
    }
    isSubmitting.value = false
    await showFailure(signInErrorKey(cause))
  }
}

async function signInWithGoogle(): Promise<void> {
  if (isSubmitting.value) return

  isGoogleSignIn.value = true
  isSubmitting.value = true
  failureKey.value = null

  const result = await continueWithGoogle()
  if (!isMounted) return
  if (result.kind === 'signed-in') {
    await leaveSignedIn()
    return
  }
  isSubmitting.value = false
  isGoogleSignIn.value = false
  if (result.kind === 'failed') await showFailure(result.messageKey)
}

onUnmounted(() => {
  isMounted = false
})
</script>

<template>
  <PushedScreen
    class="sign-in"
    :title="title"
    :back-label="t('form.back')"
    :aria-busy="isSubmitting"
    @back="back"
  >
    <div v-if="isSubmitting" class="sign-in__loading" role="status">
      <v-progress-circular indeterminate color="primary" :size="34" :width="3" />
      <p class="sign-in__loading-label">{{ loadingLabel }}</p>
    </div>

    <div v-else-if="hasNoAnswer" class="sign-in__no-answer">
      <p class="sign-in__error" role="alert">
        <v-icon icon="ms:error" size="18" aria-hidden="true" />
        <span>{{ t('auth.errors.unknown') }}</span>
      </p>
      <v-btn class="sign-in__no-answer-retry" variant="flat" color="primary" @click="retryCheck">
        {{ t('plus.retry') }}
      </v-btn>
    </div>

    <EmailCodeStep
      v-else-if="emailCode.email.value"
      :email="emailCode.email.value"
      :code="emailCode.code.value"
      :error-key="emailCode.errorKey.value"
      :notice-key="emailCode.noticeKey.value"
      :is-expired="emailCode.isExpired.value"
      :is-resending="emailCode.isResending.value"
      @update:code="emailCode.setCode"
      @resend="resendCode"
      @change-address="backToForm"
    />

    <div v-else class="sign-in__panel">
      <p class="sign-in__intro">{{ t('auth.intro') }}</p>

      <GoogleSignInButton
        class="sign-in__google"
        :label="t('auth.google.continue')"
        @click="signInWithGoogle"
      />

      <hr class="sign-in__separator" />

      <div v-if="isSignUp" class="sign-in__email-hero">
        <span class="sign-in__email-hero-icon" aria-hidden="true">
          <v-icon icon="ms:mark_email_read" size="26" />
        </span>
        <h2 class="sign-in__email-hero-title">{{ t('auth.signUp.emailTitle') }}</h2>
        <p class="sign-in__email-hero-body">{{ t('auth.signUp.emailBody') }}</p>
      </div>

      <form class="sign-in__form" novalidate @submit.prevent="submit">
        <p v-if="failureKey" ref="errorBanner" class="sign-in__error" role="alert" tabindex="-1">
          <v-icon icon="ms:error" size="18" aria-hidden="true" />
          <span>{{ t(failureKey) }}</span>
        </p>

        <div ref="fields" class="sign-in__fields">
          <FormField
            :label="t('auth.email.label')"
            control-id="sign-in-email"
            required
            :error="errors.email ? t(errors.email) : null"
          >
            <template #default="{ describedby, invalid }">
              <v-text-field
                id="sign-in-email"
                v-model="values.email"
                class="form-field__input"
                type="email"
                autocomplete="email"
                inputmode="email"
                autocapitalize="none"
                spellcheck="false"
                variant="outlined"
                hide-details
                aria-required="true"
                :aria-describedby="describedby"
                :aria-invalid="invalid"
                :error="invalid"
              />
            </template>
          </FormField>

          <FormField
            :label="t('auth.password.label')"
            control-id="sign-in-password"
            required
            :error="errors.password ? t(errors.password) : null"
            :help="passwordHelp"
          >
            <template #default="{ describedby, invalid }">
              <v-text-field
                id="sign-in-password"
                v-model="values.password"
                class="form-field__input"
                type="password"
                :autocomplete="passwordAutocomplete"
                variant="outlined"
                hide-details
                aria-required="true"
                :aria-describedby="describedby"
                :aria-invalid="invalid"
                :error="invalid"
              />
            </template>
          </FormField>
          <v-btn
            v-if="!isSignUp"
            class="sign-in__forgot"
            variant="text"
            color="primary"
            @click="openPasswordReset"
          >
            {{ t('auth.passwordReset.link') }}
          </v-btn>
        </div>

        <AccountLegalNotice v-if="isSignUp" class="sign-in__legal" />

        <v-btn class="sign-in__submit" type="submit" variant="flat" color="primary">
          {{ submitLabel }}
        </v-btn>
      </form>

      <p v-if="canSignUp" class="sign-in__toggle">
        {{ toggleLabel }}
        <v-btn class="sign-in__toggle-action" variant="text" color="primary" @click="toggleMode">
          {{ toggleAction }}
        </v-btn>
      </p>
    </div>

    <template v-if="isCodeStep && !isSubmitting" #actions>
      <div class="sign-in__actions">
        <v-btn
          class="sign-in__confirm-code"
          variant="flat"
          color="primary"
          block
          :disabled="!emailCode.isComplete.value || emailCode.isResending.value"
          @click="confirmCode"
        >
          {{ t('auth.code.confirm') }}
        </v-btn>
      </div>
    </template>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.sign-in__panel {
  padding: 4px 20px 32px;
}

.sign-in__no-answer {
  padding: 16px 20px 32px;
}

.sign-in__intro {
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
  line-height: 1.55;
}

.sign-in__google {
  margin-top: 24px;
}

.sign-in__separator {
  margin: 24px 0 0;
  border: 0;
  border-top: 1px solid tokens.$color-divider;
}

.sign-in__form {
  margin-top: 24px;
}

.sign-in__email-hero {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-top: 24px;
}

.sign-in__email-hero + .sign-in__form {
  margin-top: 20px;
}

.sign-in__email-hero-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: tokens.$color-priming-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.sign-in__email-hero-title {
  margin: 4px 0 0;
  font-family: tokens.$font-family-heading;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
}

.sign-in__email-hero-body {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.5;
}

.sign-in__error {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 18px;
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

.sign-in__fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.sign-in__forgot {
  align-self: flex-end;
  height: 44px;
  margin: -12px -6px 0 0;
  padding-inline: 6px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;

  @include tap.tap-target;
}

.sign-in__legal {
  margin-top: 18px;
}

.sign-in__submit,
.sign-in__no-answer-retry {
  width: 100%;
  height: 52px;
  margin-top: 26px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.sign-in__toggle {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 2px;
  margin-top: 18px;
  color: tokens.$color-text-secondary;
  font-size: 14px;
}

.sign-in__toggle-action {
  height: 44px;
  padding-inline: 6px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: normal;

  @include tap.tap-target;
}

.sign-in__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  min-height: 60vh;
  min-height: 60dvh;
  padding: 32px 24px;
}

.sign-in__loading-label {
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
}

.sign-in__actions {
  padding: 12px 20px 24px;
}

.sign-in__confirm-code {
  height: 52px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
</style>
