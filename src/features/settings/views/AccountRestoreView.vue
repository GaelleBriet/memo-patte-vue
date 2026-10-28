<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'

import ChoiceCards from './ChoiceCards.vue'
import RestoreProgressCard from './RestoreProgressCard.vue'
import { useAccountRestore } from '../composables/use-account-restore'
import { useMergeReplaceChoices } from '../composables/use-merge-replace-choices'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import ExportCopyChoice from '@/shared/components/ExportCopyChoice.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'

const { t } = useI18n()
const modes = useMergeReplaceChoices()
const {
  state,
  isRestoring,
  summaryText,
  selected,
  isConfirmOpen,
  submit,
  confirmReplace,
  leave,
  signIn,
  later,
} = useAccountRestore()

const groupLabelId = useId()
</script>

<template>
  <PushedScreen
    class="account-restore"
    :title="t('settings.restore.title')"
    :back-label="t('form.back')"
    :back-hidden="isRestoring"
    :aria-busy="isRestoring"
    @back="leave"
  >
    <div class="account-restore__content">
      <template v-if="state.step === 'choice'">
        <div class="settings-row account-restore__card account-restore__found">
          <v-icon class="settings-row__icon" icon="ms:cloud_done" size="24" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.restore.found') }}</span>
            <span class="settings-row__hint">{{ summaryText }}</span>
          </span>
        </div>
        <p class="account-restore__notice account-restore__existing">
          <v-icon icon="ms:info" size="19" />
          <span>{{ t('settings.restore.existing') }}</span>
        </p>
        <p :id="groupLabelId" class="account-restore__group-label" aria-hidden="true">
          {{ t('settings.restore.modes') }}
        </p>
        <ChoiceCards
          v-model="selected"
          :choices="modes"
          :labelledby="groupLabelId"
          :show-radio="false"
        />
      </template>

      <RestoreProgressCard
        v-else-if="state.step === 'restoring'"
        class="account-restore__card account-restore__progress"
        :progress="state.progress"
      />

      <p
        v-else-if="state.step === 'waiting-network'"
        class="account-restore__notice account-restore__offline"
        role="status"
      >
        <v-icon icon="ms:cloud_off" size="19" />
        <span>{{ t('settings.restore.offline') }}</span>
      </p>

      <p
        v-else-if="state.step === 'waiting-sign-in'"
        class="account-restore__notice account-restore__session-expired"
        role="status"
      >
        <v-icon icon="ms:sync_problem" size="19" />
        <span>{{ t('settings.restore.sessionExpired') }}</span>
      </p>
    </div>

    <template
      v-if="
        state.step === 'choice' ||
        state.step === 'waiting-network' ||
        state.step === 'waiting-sign-in'
      "
      #actions
    >
      <div class="account-restore__actions">
        <v-btn
          v-if="state.step === 'choice'"
          class="account-restore__action account-restore__continue"
          variant="flat"
          color="primary"
          :disabled="selected === null"
          @click="submit"
        >
          {{ t('settings.import.submit') }}
        </v-btn>
        <v-btn
          v-if="state.step === 'waiting-sign-in'"
          class="account-restore__action account-restore__sign-in"
          variant="flat"
          color="primary"
          prepend-icon="ms:login"
          @click="signIn"
        >
          {{ t('settings.backup.cloud.interrupted.signIn') }}
        </v-btn>
        <v-btn
          v-if="state.step !== 'choice'"
          class="account-restore__action account-restore__later"
          variant="outlined"
          color="primary"
          @click="later"
        >
          {{ t('settings.restore.later') }}
        </v-btn>
      </div>
    </template>
  </PushedScreen>

  <ConfirmDialog
    v-model="isConfirmOpen"
    :title="t('settings.import.confirm.title')"
    :text="t('settings.restore.confirmBody')"
    :cancel-label="t('settings.import.confirm.cancel')"
    :confirm-label="t('settings.import.confirm.submit')"
    @confirm="confirmReplace"
  >
    <template #choices>
      <ExportCopyChoice />
    </template>
  </ConfirmDialog>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.account-restore__content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px tokens.$padding-section-inline 32px;

  :deep(.choice-cards) {
    margin-top: 0;
  }
}

.account-restore__card {
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));

  .settings-row__label {
    font-weight: 700;
  }

  .settings-row__icon {
    color: rgb(var(--v-theme-primary));
  }
}

.account-restore__notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 0;
  padding: 12px 14px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-notice;
  background: rgb(var(--v-theme-surface));
  font-size: 13.5px;
  line-height: 1.45;

  > .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.account-restore__group-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.account-restore__actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px 20px 30px;
}

.account-restore__action {
  width: 100%;
  height: 52px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.account-restore__later {
  border-width: 1.5px;
}
</style>
