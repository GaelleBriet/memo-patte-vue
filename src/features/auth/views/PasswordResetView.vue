<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useCodeStepBack } from '../composables/use-code-step-back'
import { usePasswordReset } from '../composables/use-password-reset'
import { CODE_LENGTH } from '../logic/email-code'
import { useSignedInExit } from '../composables/use-signed-in-exit'
import FormField from '@/shared/form/FormField.vue'
import PasswordField from '@/shared/form/PasswordField.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { returnTo } from '@/shared/utils/return-to'
import { passwordResetBackRoute } from '@/shared/utils/sign-in-route'
import { showToast } from '@/shared/utils/toast'

import EmailCodeStep from './EmailCodeStep.vue'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()

const startEmail = router.options.history.state.email
const isEmailLocked = router.options.history.state.emailLocked === true

const reset = usePasswordReset({
  email: typeof startEmail === 'string' ? startEmail : '',
  isEmailLocked,
})

const {
  emailCode,
  address,
  addressErrors,
  addressFailureKey,
  newPassword,
  passwordError,
  confirmationError,
} = reset
const isLeaving = ref(false)

const { hasNoAnswer, leaveSignedIn, retryCheck } = useSignedInExit(isLeaving)

const isCodeStep = computed(() => reset.step.value === 'code')
const addressError = computed(() => {
  const key = addressErrors.value.email ?? addressFailureKey.value
  return key ? t(key) : null
})

useCodeStepBack(isCodeStep, reset.backToAddress)

function back(): void {
  if (isCodeStep.value) reset.backToAddress()
  else returnTo(router, passwordResetBackRoute(route.query))
}

async function sendCode(): Promise<void> {
  await reset.sendCode()
}

async function resendCode(): Promise<void> {
  const email = emailCode.email.value
  if ((await emailCode.resend()) === 'sent') showToast(t('auth.code.sent', { email }))
}

async function submit(): Promise<void> {
  if (!(await reset.reset())) return
  showToast(t('auth.passwordReset.done'))
  isLeaving.value = true
  await leaveSignedIn()
}
</script>

<template>
  <PushedScreen
    class="password-reset"
    :title="t('auth.passwordReset.title')"
    :back-label="t('form.back')"
    :aria-busy="isLeaving"
    @back="back"
  >
    <div v-if="isLeaving" class="password-reset__loading" role="status">
      <v-progress-circular indeterminate color="primary" :size="34" :width="3" />
      <p class="password-reset__loading-label">{{ t('auth.signIn.loading') }}</p>
    </div>

    <div v-else-if="hasNoAnswer" class="password-reset__no-answer">
      <p class="password-reset__error" role="alert">
        <v-icon icon="ms:error_fill" size="16" aria-hidden="true" />
        <span>{{ t('auth.errors.unknown') }}</span>
      </p>
      <v-btn class="password-reset__retry" variant="flat" color="primary" @click="retryCheck">
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
      :can-resend="!reset.isResetting.value"
      :message="
        t('auth.passwordReset.codeMessage', { email: emailCode.email.value, length: CODE_LENGTH })
      "
      :label="t('auth.passwordReset.codeLabel')"
      :input-label="t('auth.passwordReset.codeInputLabel', { length: CODE_LENGTH })"
      :can-change-address="false"
      @update:code="emailCode.setCode"
      @resend="resendCode"
    >
      <PasswordField
        v-model="newPassword.password"
        :label="t('auth.passwordReset.newPassword')"
        control-id="password-reset-new-password"
        autocomplete="new-password"
        required
        :error="passwordError ? t(passwordError) : null"
        :help="passwordError ? null : t('auth.password.help')"
      />
      <PasswordField
        v-model="newPassword.confirmation"
        :label="t('auth.password.confirmNew')"
        control-id="password-reset-confirmation"
        autocomplete="new-password"
        required
        :error="confirmationError ? t(confirmationError) : null"
        @blur="reset.leaveConfirmation"
      />
    </EmailCodeStep>

    <form v-else class="password-reset__address" novalidate @submit.prevent="sendCode">
      <p class="password-reset__intro">
        {{ t('auth.passwordReset.intro', { length: CODE_LENGTH }) }}
      </p>
      <FormField
        :label="t('auth.email.label')"
        control-id="password-reset-email"
        required
        :error="addressError"
      >
        <template #default="{ describedby, invalid }">
          <v-text-field
            id="password-reset-email"
            v-model="address.email"
            :readonly="isEmailLocked"
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
    </form>

    <template v-if="!isLeaving && !hasNoAnswer" #actions>
      <div class="password-reset__actions">
        <v-btn
          v-if="isCodeStep"
          class="password-reset__submit"
          variant="flat"
          color="primary"
          block
          :loading="reset.isResetting.value"
          :disabled="
            !emailCode.isComplete.value ||
            emailCode.isResending.value ||
            !reset.isPasswordConfirmed.value
          "
          @click="submit"
        >
          {{ t('auth.passwordReset.submit') }}
        </v-btn>
        <v-btn
          v-else
          class="password-reset__send"
          variant="flat"
          color="primary"
          block
          :loading="reset.isSending.value"
          @click="sendCode"
        >
          {{ t('auth.passwordReset.send') }}
        </v-btn>
      </div>
    </template>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.password-reset__address,
.password-reset__no-answer {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 20px 32px;
}

.password-reset__intro {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
  line-height: 1.55;
}

.password-reset__error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  color: rgb(var(--v-theme-error));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.4;
}

.password-reset__loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  min-height: 60vh;
  min-height: 60dvh;
  padding: 32px 24px;
}

.password-reset__loading-label {
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
}

.password-reset__actions {
  padding: 12px 20px 24px;
}

.password-reset__submit,
.password-reset__send,
.password-reset__retry {
  height: 52px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
</style>
