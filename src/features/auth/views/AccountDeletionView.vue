<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAccountDeletion } from '../composables/use-account-deletion'
import { accountDeletionPurchase } from '../logic/account-deletion-purchase'
import { leaveDeletedAccount } from '../logic/leave-deleted-account'
import AccountDeletionSummary from './AccountDeletionSummary.vue'
import GoogleSignInButton from './GoogleSignInButton.vue'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import PasswordField from '@/shared/form/PasswordField.vue'
import { returnTo } from '@/shared/utils/return-to'

const { t } = useI18n()
const router = useRouter()
const purchase = usePurchaseStore()
const {
  step,
  method,
  identityError,
  isConfirming,
  proceed,
  confirmWithPassword,
  confirmWithGoogle,
  cancelFinalConfirmation,
  deleteAccount,
  retry,
  back,
} = useAccountDeletion()

const password = ref('')

const deletionPurchase = computed(() => accountDeletionPurchase(purchase.status))
const isExplaining = computed(() => step.value === 'explain' || step.value === 'final-confirm')
const isConfirmingIdentity = computed(() => step.value === 'confirm-identity')
const isDeleted = computed(() => step.value === 'deleted')
const asksPassword = computed(() => method.value?.kind === 'password')
const hasActions = computed(
  () =>
    isExplaining.value ||
    (isConfirmingIdentity.value && asksPassword.value) ||
    step.value === 'failed' ||
    isDeleted.value,
)
const title = computed(() => {
  if (isConfirmingIdentity.value) return t('settings.account.delete.identity.title')
  if (isDeleted.value) return t('settings.account.delete.deleted.title')
  return t('settings.account.delete.title')
})
const identityErrorText = computed(() =>
  identityError.value ? t(identityError.value.key, identityError.value.params ?? {}) : null,
)
const isFinalConfirmOpen = computed({
  get: () => step.value === 'final-confirm',
  set: (open) => {
    if (!open && step.value === 'final-confirm') cancelFinalConfirmation()
  },
})

watch(step, (next) => {
  if (next !== 'confirm-identity') password.value = ''
})

function leave(): void {
  returnTo(router, { name: 'settings-account' })
}

function finish(): void {
  leaveDeletedAccount(router)
}

function eraseThisPhone(): void {
  void router.push({ name: 'settings-erase' })
}

function goBack(): void {
  if (isDeleted.value) finish()
  else if (!back()) leave()
}

async function submitPassword(): Promise<void> {
  await confirmWithPassword(password.value)
}
</script>

<template>
  <PushedScreen
    class="account-deletion"
    :title="title"
    :back-label="isDeleted ? t('settings.account.delete.deleted.close') : t('form.back')"
    :back-icon="isDeleted ? 'ms:close' : undefined"
    :back-hidden="step === 'deleting'"
    :aria-busy="isConfirming || step === 'deleting'"
    @back="goBack"
  >
    <div v-if="isExplaining" class="account-deletion__content">
      <AccountDeletionSummary :purchase="deletionPurchase" />
    </div>

    <div v-else-if="isConfirmingIdentity" class="account-deletion__content">
      <p class="account-deletion__intro">{{ t('settings.account.delete.identity.intro') }}</p>

      <form
        v-if="asksPassword"
        class="account-deletion__form"
        novalidate
        @submit.prevent="submitPassword"
      >
        <PasswordField
          v-model="password"
          :label="t('auth.password.label')"
          control-id="account-deletion-password"
          autocomplete="current-password"
          required
          autofocus
          :error="identityErrorText"
        />
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

    <div v-else-if="step === 'deleting'" class="account-deletion__status" role="status">
      <span class="account-deletion__status-icon account-deletion__status-icon--progress">
        <v-progress-circular indeterminate color="primary" :size="34" :width="3" />
      </span>
      <h2 class="account-deletion__status-title">
        {{ t('settings.account.delete.deleting.title') }}
      </h2>
      <p class="account-deletion__status-body">{{ t('settings.account.delete.deleting.body') }}</p>
    </div>

    <div v-else-if="isDeleted" class="account-deletion__status" role="status">
      <span class="account-deletion__status-icon account-deletion__status-icon--done">
        <v-icon icon="ms:check_circle" size="40" aria-hidden="true" />
      </span>
      <h2 class="account-deletion__status-title">
        {{ t('settings.account.delete.deleted.title') }}
      </h2>
      <p class="account-deletion__status-body">{{ t('settings.account.delete.deleted.body') }}</p>
      <p class="account-deletion__erase-note">
        <v-icon icon="ms:delete_forever" size="20" aria-hidden="true" />
        <span>{{ t('settings.account.delete.deleted.erase') }}</span>
      </p>
      <v-btn
        class="account-deletion__erase"
        variant="outlined"
        color="error"
        block
        @click="eraseThisPhone"
      >
        {{ t('settings.account.delete.deleted.eraseAction') }}
      </v-btn>
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

    <template v-if="hasActions" #actions>
      <div v-if="isDeleted" class="account-deletion__actions">
        <v-btn class="account-deletion__done" variant="text" color="primary" block @click="finish">
          {{ t('settings.account.delete.deleted.done') }}
        </v-btn>
      </div>
      <div v-else class="account-deletion__actions">
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
          :aria-label="t('settings.account.delete.identity.confirmLabel')"
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

  <ConfirmDialog
    v-model="isFinalConfirmOpen"
    :title="t('settings.account.delete.finalConfirm.title')"
    :text="t('settings.account.delete.finalConfirm.text')"
    :note="deletionPurchase.note ? t(deletionPurchase.note.finalConfirm) : null"
    :cancel-label="t('settings.account.delete.cancel')"
    :confirm-label="t('settings.account.delete.finalConfirm.delete')"
    :confirm-aria-label="t('settings.account.delete.finalConfirm.deleteLabel')"
    @confirm="deleteAccount"
  />
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

.account-deletion__status-icon--progress,
.account-deletion__status-icon--done {
  background: tokens.$color-notice-surface;
  color: rgb(var(--v-theme-primary));
}

.account-deletion__erase-note {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 100%;
  margin: 28px 0 0;
  padding: 12px 16px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-notice;
  background: rgb(var(--v-theme-surface));
  font-size: 13.5px;
  line-height: 1.45;
  text-align: start;

  > .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.account-deletion__erase {
  height: 52px;
  margin-top: 16px;
  border-width: 1.5px;
  border-radius: tokens.$radius-pill;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.account-deletion__done {
  height: 52px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
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
