<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAccountDeletion } from '../composables/use-account-deletion'
import GoogleSignInButton from './GoogleSignInButton.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import FormField from '@/shared/form/FormField.vue'
import { MANAGE_SUBSCRIPTIONS_URL } from '@/shared/utils/google-play'
import { returnTo } from '@/shared/utils/return-to'

const { t } = useI18n()
const router = useRouter()
const {
  step,
  method,
  identityError,
  isConfirming,
  proceed,
  confirmWithPassword,
  confirmWithGoogle,
  retry,
  back,
} = useAccountDeletion()

const password = ref('')

const isExplaining = computed(() => step.value === 'explain' || step.value === 'final-confirm')
const isConfirmingIdentity = computed(() => step.value === 'confirm-identity')
const asksPassword = computed(() => method.value?.kind === 'password')
const title = computed(() =>
  isConfirmingIdentity.value
    ? t('settings.account.delete.identity.title')
    : t('settings.account.delete.title'),
)
const identityErrorText = computed(() =>
  identityError.value ? t(identityError.value.key, identityError.value.params ?? {}) : null,
)

watch(step, (next) => {
  if (next !== 'confirm-identity') password.value = ''
})

function leave(): void {
  returnTo(router, { name: 'settings-account' })
}

function goBack(): void {
  if (!back()) leave()
}

async function submitPassword(): Promise<void> {
  await confirmWithPassword(password.value)
}
</script>

<template>
  <PushedScreen
    class="account-deletion"
    :title="title"
    :back-label="t('form.back')"
    :aria-busy="isConfirming"
    @back="goBack"
  >
    <div v-if="isExplaining" class="account-deletion__content">
      <section class="account-deletion__panel account-deletion__panel--removed">
        <h2 class="account-deletion__panel-title">
          {{ t('settings.account.delete.removed.title') }}
        </h2>
        <ul class="account-deletion__list">
          <li class="account-deletion__item">
            <v-icon icon="ms:do_not_disturb_on" size="20" aria-hidden="true" />
            <span>{{ t('settings.account.delete.removed.account') }}</span>
          </li>
          <li class="account-deletion__item">
            <v-icon icon="ms:do_not_disturb_on" size="20" aria-hidden="true" />
            <span>{{ t('settings.account.delete.removed.backup') }}</span>
          </li>
          <li class="account-deletion__item">
            <v-icon icon="ms:do_not_disturb_on" size="20" aria-hidden="true" />
            <span>{{ t('settings.account.delete.removed.photos') }}</span>
          </li>
          <li class="account-deletion__item">
            <v-icon icon="ms:do_not_disturb_on" size="20" aria-hidden="true" />
            <span>{{ t('settings.account.delete.removed.usage') }}</span>
          </li>
        </ul>
      </section>

      <section class="account-deletion__panel account-deletion__panel--kept">
        <h2 class="account-deletion__panel-title">
          {{ t('settings.account.delete.kept.title') }}
        </h2>
        <ul class="account-deletion__list">
          <li class="account-deletion__item">
            <v-icon icon="ms:check_circle" size="20" aria-hidden="true" />
            <span>{{ t('settings.account.delete.kept.carnet') }}</span>
          </li>
          <li class="account-deletion__item">
            <v-icon icon="ms:check_circle" size="20" aria-hidden="true" />
            <span>{{ t('settings.account.delete.kept.purchases') }}</span>
          </li>
        </ul>
      </section>

      <div class="account-deletion__subscription">
        <v-icon icon="ms:storefront" size="20" aria-hidden="true" />
        <div class="account-deletion__subscription-text">
          <p>{{ t('settings.account.delete.subscription') }}</p>
          <a
            class="account-deletion__manage"
            :href="MANAGE_SUBSCRIPTIONS_URL"
            target="_blank"
            rel="noopener"
          >
            <span>{{ t('plus.terms.manage') }}</span>
            <v-icon icon="ms:open_in_new" size="16" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>

    <div v-else-if="isConfirmingIdentity" class="account-deletion__content">
      <p class="account-deletion__intro">{{ t('settings.account.delete.identity.intro') }}</p>

      <form
        v-if="asksPassword"
        class="account-deletion__form"
        novalidate
        @submit.prevent="submitPassword"
      >
        <FormField
          :label="t('auth.password.label')"
          control-id="account-deletion-password"
          required
          :error="identityErrorText"
        >
          <template #default="{ describedby, invalid }">
            <v-text-field
              id="account-deletion-password"
              v-model="password"
              class="form-field__input"
              type="password"
              autocomplete="current-password"
              variant="outlined"
              hide-details
              autofocus
              aria-required="true"
              :aria-describedby="describedby"
              :aria-invalid="invalid"
              :error="invalid"
            />
          </template>
        </FormField>
      </form>

      <template v-else>
        <p v-if="identityErrorText" class="account-deletion__error" role="alert">
          <v-icon icon="ms:error" size="18" aria-hidden="true" />
          <span>{{ identityErrorText }}</span>
        </p>
        <GoogleSignInButton
          class="account-deletion__google"
          :label="t('settings.account.delete.identity.google')"
          @click="confirmWithGoogle"
        />
        <v-btn class="account-deletion__cancel" variant="text" color="primary" block @click="leave">
          {{ t('settings.account.delete.cancel') }}
        </v-btn>
      </template>
    </div>

    <div v-else-if="step === 'failed'" class="account-deletion__status" role="alert">
      <span class="account-deletion__status-icon account-deletion__status-icon--failed">
        <v-icon icon="ms:error" size="36" aria-hidden="true" />
      </span>
      <h2 class="account-deletion__status-title">
        {{ t('settings.account.delete.failed.title') }}
      </h2>
      <p class="account-deletion__status-body">{{ t('settings.account.delete.failed.body') }}</p>
    </div>

    <template
      v-if="isExplaining || (isConfirmingIdentity && asksPassword) || step === 'failed'"
      #actions
    >
      <div class="account-deletion__actions">
        <v-btn
          v-if="isExplaining"
          class="account-deletion__continue account-deletion__primary"
          variant="flat"
          color="primary"
          block
          @click="proceed"
        >
          {{ t('settings.account.delete.continue') }}
        </v-btn>
        <v-btn
          v-else-if="isConfirmingIdentity"
          class="account-deletion__confirm account-deletion__primary"
          variant="flat"
          color="primary"
          block
          :disabled="password === ''"
          :loading="isConfirming"
          @click="submitPassword"
        >
          {{ t('settings.account.delete.identity.confirm') }}
        </v-btn>
        <v-btn
          v-else
          class="account-deletion__retry account-deletion__primary"
          variant="flat"
          color="primary"
          block
          @click="retry"
        >
          {{ t('settings.account.delete.failed.retry') }}
        </v-btn>
        <v-btn class="account-deletion__cancel" variant="text" color="primary" block @click="leave">
          {{ t('settings.account.delete.cancel') }}
        </v-btn>
      </div>
    </template>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.account-deletion__content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px tokens.$padding-section-inline 32px;
}

.account-deletion__panel {
  padding: 16px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-notice;
  background: rgb(var(--v-theme-surface));
}

.account-deletion__panel-title {
  margin: 0 0 10px;
  font-size: 13.5px;
  font-weight: 700;
}

.account-deletion__panel--removed {
  .account-deletion__panel-title,
  .v-icon {
    color: rgb(var(--v-theme-error));
  }
}

.account-deletion__panel--kept {
  .account-deletion__panel-title,
  .v-icon {
    color: rgb(var(--v-theme-primary));
  }
}

.account-deletion__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.account-deletion__item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  font-size: 14.5px;
  font-weight: 600;
  line-height: 1.4;

  .v-icon {
    flex: 0 0 auto;
    margin-top: 1px;
  }
}

.account-deletion__subscription {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: tokens.$radius-notice;
  background: tokens.$color-account-deletion-notice-surface;
  font-size: 13.5px;
  line-height: 1.45;

  > .v-icon {
    flex: 0 0 auto;
    color: tokens.$color-text-secondary;
  }

  p {
    margin: 0;
  }
}

.account-deletion__manage {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  min-height: tokens.$size-tap-target;
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
  text-decoration: none;
}

.account-deletion__intro {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
  line-height: 1.55;
}

.account-deletion__error {
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

  .v-icon {
    flex: 0 0 auto;
    margin-top: 1px;
    color: rgb(var(--v-theme-error));
  }
}

.account-deletion__google {
  margin-top: 10px;
}

.account-deletion__status {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 56px 32px 32px;
  text-align: center;
}

.account-deletion__status-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  margin-bottom: 24px;
  border-radius: 50%;
}

.account-deletion__status-icon--failed {
  background: tokens.$color-account-deletion-failed-surface;
  color: tokens.$color-text-secondary;
}

.account-deletion__status-title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
}

.account-deletion__status-body {
  max-width: 300px;
  margin: 10px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
  line-height: 1.55;
}

.account-deletion__actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 20px 24px;
}

.account-deletion__primary {
  height: 52px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.account-deletion__cancel {
  height: 44px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;

  @include tap.tap-target;
}
</style>
