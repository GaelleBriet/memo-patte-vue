<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAccountIdentity } from '../composables/use-account-identity'
import { usePasswordChange } from '../composables/use-password-change'
import FormField from '@/shared/form/FormField.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { returnTo } from '@/shared/utils/return-to'
import { passwordResetRoute } from '@/shared/utils/sign-in-route'
import { showToast } from '@/shared/utils/toast'

const ACCOUNT_ROUTE = 'settings-account'

const { t } = useI18n()
const router = useRouter()
const { identity } = useAccountIdentity()
const { values, fieldError, failureKey, isSaving, save } = usePasswordChange()

const currentError = computed(() => fieldError('current'))
const nextError = computed(() => fieldError('next'))

function goBack(): void {
  returnTo(router, { name: ACCOUNT_ROUTE })
}

function openPasswordReset(): void {
  void router.push(passwordResetRoute({ from: ACCOUNT_ROUTE }, identity.value?.email ?? ''))
}

async function submit(): Promise<void> {
  if (!(await save())) return
  showToast(t('auth.passwordReset.done'))
  goBack()
}
</script>

<template>
  <PushedScreen
    class="password-change"
    :title="t('settings.account.password.action')"
    :back-label="t('form.back')"
    :aria-busy="isSaving"
    @back="goBack"
  >
    <form class="password-change__form" novalidate @submit.prevent="submit">
      <p v-if="failureKey" class="password-change__error" role="alert">
        <v-icon icon="ms:error_fill" size="16" aria-hidden="true" />
        <span>{{ t(failureKey) }}</span>
      </p>

      <div class="password-change__current">
        <FormField
          :label="t('settings.account.password.current')"
          control-id="password-change-current"
          required
          :error="currentError ? t(currentError) : null"
        >
          <template #default="{ describedby, invalid }">
            <v-text-field
              id="password-change-current"
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
          class="password-change__forgot"
          variant="text"
          color="primary"
          @click="openPasswordReset"
        >
          {{ t('auth.passwordReset.link') }}
        </v-btn>
      </div>

      <FormField
        :label="t('auth.passwordReset.newPassword')"
        control-id="password-change-next"
        required
        :error="nextError ? t(nextError) : null"
        :help="nextError ? null : t('auth.password.help')"
      >
        <template #default="{ describedby, invalid }">
          <v-text-field
            id="password-change-next"
            v-model="values.next"
            class="form-field__input"
            type="password"
            autocomplete="new-password"
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
      <div class="password-change__actions">
        <v-btn
          class="password-change__save"
          variant="flat"
          color="primary"
          block
          :loading="isSaving"
          :aria-label="t('settings.account.password.saveLabel')"
          @click="submit"
        >
          {{ t('settings.account.password.save') }}
        </v-btn>
      </div>
    </template>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.password-change__form {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 4px 20px 32px;
}

.password-change__current {
  display: flex;
  flex-direction: column;
}

.password-change__forgot {
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

.password-change__error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  color: rgb(var(--v-theme-error));
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.4;
}

.password-change__actions {
  padding: 12px 20px 24px;
}

.password-change__save {
  height: 52px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
</style>
