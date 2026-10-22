<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAccountIdentity } from '../composables/use-account-identity'
import { CODE_LENGTH } from '../logic/email-code'
import { useEmailChange } from '../composables/use-email-change'
import FormField from '@/shared/form/FormField.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { returnTo } from '@/shared/utils/return-to'
import { passwordResetRoute } from '@/shared/utils/sign-in-route'
import { showToast } from '@/shared/utils/toast'

import EmailCodeStep from './EmailCodeStep.vue'

const ACCOUNT_ROUTE = 'settings-account'

const { t } = useI18n()
const router = useRouter()
const { identity } = useAccountIdentity()
const change = useEmailChange({ accountEmail: () => identity.value?.email ?? null })

const { emailCode, values, fieldError, failureKey } = change

const isCodeStep = computed(() => change.step.value !== 'address')
const isCurrentStep = computed(() => change.step.value === 'current')
const currentError = computed(() => fieldError('current'))
const emailError = computed(() => fieldError('email'))

function leave(): void {
  returnTo(router, { name: ACCOUNT_ROUTE })
}

function back(): void {
  if (isCodeStep.value) change.backToAddress()
  else leave()
}

function openPasswordReset(): void {
  const email = identity.value?.email ?? ''
  void router.replace(passwordResetRoute({ from: ACCOUNT_ROUTE }, email, { emailLocked: true }))
}

async function resendCode(): Promise<void> {
  if ((await change.resend()) === 'sent') showToast(t('settings.account.email.resent'))
}

function openHelp(): void {
  void router.push({ name: 'settings-help' })
}

async function confirm(): Promise<void> {
  if (!(await change.confirm())) return
  showToast(t('settings.account.email.done'))
  leave()
}
</script>

<template>
  <PushedScreen
    class="email-change"
    :title="t('settings.account.email.action')"
    :back-label="t('form.back')"
    :aria-busy="change.isSending.value || emailCode.isConfirming.value"
    @back="back"
  >
    <EmailCodeStep
      v-if="emailCode.email.value"
      :email="emailCode.email.value"
      :code="emailCode.code.value"
      :error-key="emailCode.errorKey.value"
      :notice-key="emailCode.noticeKey.value"
      :is-expired="emailCode.isExpired.value"
      :is-resending="emailCode.isResending.value"
      :can-resend="!emailCode.isConfirming.value"
      :message="
        t(isCurrentStep ? 'settings.account.email.codeCurrent' : 'settings.account.email.codeNew', {
          email: emailCode.email.value,
        })
      "
      :label="t('settings.account.email.codeLabel')"
      :input-label="
        isCurrentStep ? null : t('settings.account.email.codeInputLabel', { length: CODE_LENGTH })
      "
      :can-change-address="false"
      @update:code="emailCode.setCode"
      @resend="resendCode"
    >
      <v-btn
        v-if="isCurrentStep"
        class="email-change__lost"
        variant="text"
        color="primary"
        @click="openHelp"
      >
        {{ t('settings.account.email.lostAccess') }}
      </v-btn>
    </EmailCodeStep>

    <form v-else class="email-change__form" novalidate @submit.prevent="change.sendCode">
      <p v-if="failureKey" class="email-change__error" role="alert">
        <v-icon icon="ms:error_fill" size="16" aria-hidden="true" />
        <span>{{ t(failureKey) }}</span>
      </p>

      <div class="email-change__current">
        <FormField
          :label="t('settings.account.password.current')"
          control-id="email-change-current"
          required
          :error="currentError ? t(currentError) : null"
        >
          <template #default="{ describedby, invalid }">
            <v-text-field
              id="email-change-current"
              v-model="values.current"
              class="form-field__input"
              type="password"
              autocomplete="current-password"
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
          class="email-change__forgot"
          variant="text"
          color="primary"
          @click="openPasswordReset"
        >
          {{ t('auth.passwordReset.link') }}
        </v-btn>
      </div>

      <FormField
        :label="t('settings.account.email.newEmail')"
        control-id="email-change-email"
        required
        :error="emailError ? t(emailError) : null"
        :help="emailError ? null : t('settings.account.email.help')"
      >
        <template #default="{ describedby, invalid }">
          <v-text-field
            id="email-change-email"
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
    </form>

    <template #actions>
      <div class="email-change__actions">
        <v-btn
          v-if="isCodeStep"
          class="email-change__confirm"
          variant="flat"
          color="primary"
          block
          :loading="emailCode.isConfirming.value"
          :disabled="!emailCode.isComplete.value || emailCode.isResending.value"
          @click="confirm"
        >
          {{ t('auth.code.confirm') }}
        </v-btn>
        <v-btn
          v-else
          class="email-change__send"
          variant="flat"
          color="primary"
          block
          :loading="change.isSending.value"
          :aria-label="t('settings.account.email.sendLabel')"
          @click="change.sendCode"
        >
          {{ t('settings.account.email.send') }}
        </v-btn>
      </div>
    </template>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.email-change__form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 20px 32px;
}

.email-change__current {
  display: flex;
  flex-direction: column;
}

.email-change__lost {
  height: 44px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;

  @include tap.tap-target;
}

.email-change__forgot {
  align-self: flex-end;
  height: 44px;
  margin: 6px -6px 0 0;
  padding-inline: 6px;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;

  @include tap.tap-target;
}

.email-change__error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  color: rgb(var(--v-theme-error));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.4;
}

.email-change__actions {
  padding: 12px 20px 24px;
}

.email-change__confirm,
.email-change__send {
  height: 52px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
</style>
