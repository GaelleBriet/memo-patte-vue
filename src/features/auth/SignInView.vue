<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { AccountError } from './account-error'
import { accountErrorKey } from './account-error-message'
import { useAuthStore } from './auth.store'
import { emptySignInFormValues, validateSignInForm, type SignInMode } from './sign-in-form'
import { focusFirstInvalid } from '@/shared/form/focus-first-invalid'
import FormField from '@/shared/form/FormField.vue'
import { useFormValidation } from '@/shared/form/use-form-validation'
import PushedScreen from '@/shared/PushedScreen.vue'
import { signInReturnRoute } from '@/shared/sign-in-route'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()
const route = useRoute()
const returnRoute = computed(() => signInReturnRoute(route.query.from))

const mode = ref<SignInMode>('sign-in')
const values = ref(emptySignInFormValues())
const { errors, validate, reset } = useFormValidation(values, (current) =>
  validateSignInForm(current, mode.value),
)
const isSubmitting = ref(false)
const failureKey = ref<string | null>(null)
const awaitingConfirmationFor = ref<string | null>(null)
const fields = useTemplateRef<HTMLElement>('fields')
const errorBanner = useTemplateRef<HTMLElement>('errorBanner')

let isMounted = true
onUnmounted(() => {
  isMounted = false
})

const isSignUp = computed(() => mode.value === 'sign-up')
const title = computed(() => (isSignUp.value ? t('auth.signUp.title') : t('auth.signIn.title')))
const submitLabel = computed(() =>
  isSignUp.value ? t('auth.signUp.submit') : t('auth.signIn.submit'),
)
const loadingLabel = computed(() =>
  isSignUp.value ? t('auth.signUp.loading') : t('auth.signIn.loading'),
)
const toggleLabel = computed(() =>
  isSignUp.value ? t('auth.signUp.toggle') : t('auth.signIn.toggle'),
)
const toggleAction = computed(() =>
  isSignUp.value ? t('auth.signUp.toggleAction') : t('auth.signIn.toggleAction'),
)
const passwordAutocomplete = computed(() => (isSignUp.value ? 'new-password' : 'current-password'))

function leave(): void {
  void router.replace(returnRoute.value)
}

function toggleMode(): void {
  mode.value = isSignUp.value ? 'sign-in' : 'sign-up'
  failureKey.value = null
  reset()
}

function backToSignIn(): void {
  values.value = { ...emptySignInFormValues(), email: awaitingConfirmationFor.value ?? '' }
  awaitingConfirmationFor.value = null
  mode.value = 'sign-in'
  failureKey.value = null
  reset()
}

async function reportFailure(cause: unknown): Promise<void> {
  failureKey.value = accountErrorKey(cause instanceof AccountError ? cause.reason : 'unknown')
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
    isSubmitting.value = false
    if (toConfirm) awaitingConfirmationFor.value = email
    else leave()
  } catch (cause) {
    if (!isMounted) return
    isSubmitting.value = false
    await reportFailure(cause)
  }
}
</script>

<template>
  <PushedScreen
    class="sign-in"
    :title="title"
    :back-label="t('form.back')"
    :aria-busy="isSubmitting"
    @back="leave"
  >
    <div v-if="awaitingConfirmationFor" class="sign-in__confirmation">
      <span class="sign-in__confirmation-icon" aria-hidden="true">
        <v-icon icon="ms:mark_email_unread" size="44" />
      </span>
      <h2 class="sign-in__confirmation-title">{{ t('auth.confirmation.title') }}</h2>
      <p class="sign-in__confirmation-message">
        {{ t('auth.confirmation.message', { email: awaitingConfirmationFor }) }}
      </p>
      <v-btn
        class="sign-in__confirmation-back"
        variant="outlined"
        color="primary"
        @click="backToSignIn"
      >
        {{ t('auth.confirmation.back') }}
      </v-btn>
    </div>

    <div v-else-if="isSubmitting" class="sign-in__loading" role="status">
      <v-progress-circular indeterminate color="primary" :size="34" :width="3" />
      <p class="sign-in__loading-label">{{ loadingLabel }}</p>
    </div>

    <div v-else class="sign-in__panel">
      <p class="sign-in__intro">{{ t('auth.intro') }}</p>

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
        </div>

        <v-btn class="sign-in__submit" type="submit" variant="flat" color="primary">
          {{ submitLabel }}
        </v-btn>
      </form>

      <p class="sign-in__toggle">
        {{ toggleLabel }}
        <v-btn class="sign-in__toggle-action" variant="text" color="primary" @click="toggleMode">
          {{ toggleAction }}
        </v-btn>
      </p>
    </div>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.sign-in__panel {
  padding: 4px 20px 32px;
}

.sign-in__intro {
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
  line-height: 1.55;
}

.sign-in__form {
  margin-top: 24px;
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

.sign-in__submit {
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

.sign-in__confirmation {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 60vh;
  min-height: 60dvh;
  padding: 32px 24px;
  text-align: center;
}

.sign-in__confirmation-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 96px;
  height: 96px;
  margin-bottom: 26px;
  border-radius: 50%;
  background: tokens.$color-priming-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.sign-in__confirmation-title {
  font-family: tokens.$font-family-heading;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
}

.sign-in__confirmation-message {
  max-width: 320px;
  margin-top: 10px;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
  line-height: 1.55;
}

.sign-in__confirmation-back {
  height: 52px;
  margin-top: 30px;
  padding-inline: 26px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}
</style>
