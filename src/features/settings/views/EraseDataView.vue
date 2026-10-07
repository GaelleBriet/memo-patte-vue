<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useDeviceErase } from '../composables/use-device-erase'
import { useExportCopy } from '../composables/use-export-copy'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { returnTo } from '@/shared/utils/return-to'

const { t } = useI18n()
const router = useRouter()
const { hasLoadFailed, hasNothingToExport, canExport, isPreparing, exportCopy } = useExportCopy()
const { situation, isConfirmOpen, isFinalOpen, isErasing, proceed, confirmFirst, confirmFinal } =
  useDeviceErase()

const signedIn = computed(() => situation.value?.signedIn === true)

function goBack(): void {
  returnTo(router, { name: 'settings-backup' })
}
</script>

<template>
  <PushedScreen
    class="erase-data"
    :title="t('settings.erase.screenTitle')"
    :subtitle="t('settings.erase.screenSubtitle')"
    :back-label="t('form.back')"
    @back="goBack"
  >
    <div v-if="situation" class="erase-data__content">
      <span class="erase-data__badge" aria-hidden="true">
        <v-icon icon="ms:delete_forever" size="26" />
      </span>
      <h2 class="erase-data__title">{{ t('settings.erase.title') }}</h2>
      <p class="erase-data__lead">
        {{ signedIn ? t('settings.erase.removedSignedIn') : t('settings.erase.removed') }}
      </p>

      <template v-if="signedIn">
        <p
          v-if="situation.hasUnsyncedChanges"
          class="erase-data__notice erase-data__notice--warning erase-data__unsynced"
        >
          <v-icon icon="ms:cloud_upload" size="20" />
          <span>{{ t('settings.erase.unsynced') }}</span>
        </p>
        <p class="erase-data__notice erase-data__account">
          <v-icon icon="ms:cloud_done" size="20" />
          <span>{{ t('settings.erase.cloudKept') }}</span>
        </p>
        <p class="erase-data__line erase-data__account">
          <v-icon icon="ms:logout" size="20" />
          <span>{{ t('settings.erase.signOut') }}</span>
        </p>
      </template>

      <p class="erase-data__copy">{{ t('settings.erase.copy') }}</p>
      <v-btn
        class="erase-data__export"
        variant="outlined"
        color="primary"
        prepend-icon="ms:ios_share"
        block
        :disabled="!canExport && !hasLoadFailed"
        :loading="isPreparing"
        @click="exportCopy"
      >
        {{ t('settings.backup.copy.export') }}
      </v-btn>
      <p v-if="hasLoadFailed" class="erase-data__export-hint erase-data__export-hint--error">
        {{ t('settings.data.loadError') }}
      </p>
      <p v-else-if="hasNothingToExport" class="erase-data__export-hint">
        {{ t('settings.data.exportEmpty') }}
      </p>

      <p class="erase-data__line erase-data__fact">
        <v-icon icon="ms:notifications_off" size="20" />
        <span>{{ t('settings.erase.reminders') }}</span>
      </p>
      <p class="erase-data__line erase-data__fact">
        <v-icon icon="ms:folder" size="20" />
        <span>{{ t('settings.erase.exports') }}</span>
      </p>
      <p class="erase-data__line erase-data__fact">
        <v-icon icon="ms:restart_alt" size="20" />
        <span>{{ t('settings.erase.restart') }}</span>
      </p>
    </div>

    <template #actions>
      <div class="erase-data__actions">
        <v-btn
          class="erase-data__continue"
          variant="outlined"
          color="error"
          block
          :disabled="!situation"
          :loading="isErasing"
          @click="proceed"
        >
          {{ t('settings.erase.continue') }}
        </v-btn>
      </div>
    </template>
  </PushedScreen>

  <ConfirmDialog
    v-model="isConfirmOpen"
    :title="t('settings.erase.confirm.title')"
    :text="signedIn ? t('settings.erase.cloudKept') : t('settings.erase.confirm.text')"
    :cancel-label="t('settings.erase.cancel')"
    :confirm-label="t('settings.erase.confirm.erase')"
    @confirm="confirmFirst"
  />
  <ConfirmDialog
    v-model="isFinalOpen"
    stacked
    :title="t('settings.erase.final.title')"
    :text="t('settings.erase.final.text')"
    :cancel-label="t('settings.erase.cancel')"
    :confirm-label="t('settings.erase.final.erase')"
    @confirm="confirmFinal"
  />
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.erase-data__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px tokens.$padding-section-inline 32px;
}

.erase-data__badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: tokens.$color-notice-surface;
  color: rgb(var(--v-theme-primary));
}

.erase-data__title {
  margin: 8px 0 0;
  font-family: tokens.$font-family-heading;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.25;
}

.erase-data__lead {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 15px;
  line-height: 1.5;
}

.erase-data__copy {
  margin: 4px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.5;
}

.erase-data__line,
.erase-data__notice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0;
  padding: 12px 16px;
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

.erase-data__notice {
  border-color: tokens.$color-notice-border;
  background: tokens.$color-notice-surface;
  color: tokens.$color-notice-text;
}

.erase-data__notice--warning {
  border-color: transparent;
  background: rgb(var(--v-theme-warning-container));
  color: rgb(var(--v-theme-on-warning-container));

  > .v-icon {
    color: rgb(var(--v-theme-warning));
  }
}

.erase-data__export {
  min-height: tokens.$size-tap-target;
  border-width: 1.5px;
  border-radius: tokens.$radius-pill;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.erase-data__export-hint {
  margin: -4px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 13px;
  text-align: center;
}

.erase-data__export-hint--error {
  color: rgb(var(--v-theme-error));
}

.erase-data__actions {
  padding: 12px 20px 30px;
}

.erase-data__continue {
  height: 52px;
  border-width: 1.5px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
</style>
