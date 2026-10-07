<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useDataExport } from '../composables/use-data-export'
import { useExportAvailability } from '../composables/use-export-availability'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { returnTo } from '@/shared/utils/return-to'
import { showToast } from '@/shared/utils/toast'

const { t } = useI18n()
const router = useRouter()
const { hasLoadFailed, hasNothingToExport, canExport, retryLoad } = useExportAvailability()
const { isPreparing, run } = useDataExport()

async function exportCopy(): Promise<void> {
  if (hasLoadFailed.value) {
    retryLoad()
    return
  }
  const outcome = await run('json', 'share')
  if (outcome === 'shared') showToast(t('settings.export.success'))
  else if (outcome === 'failed') showToast(t('settings.export.error'), { tone: 'error' })
}

function discoverPlus(): void {
  void router.push({ name: 'plus' })
}

function goBack(): void {
  returnTo(router, { name: 'settings' })
}
</script>

<template>
  <PushedScreen
    class="backup-settings"
    :title="t('settings.backup.title')"
    :back-label="t('form.back')"
    @back="goBack"
  >
    <div class="backup-settings__content">
      <div class="settings-row backup-settings__card backup-settings__local">
        <v-icon class="settings-row__icon" icon="ms:mobile" size="24" />
        <span class="settings-row__text">
          <span class="settings-row__label">{{ t('settings.backup.local.title') }}</span>
          <span class="settings-row__hint">{{ t('settings.backup.local.hint') }}</span>
        </span>
      </div>
      <p class="backup-settings__text">{{ t('settings.backup.risk') }}</p>

      <h2 class="backup-settings__section">{{ t('settings.backup.android.title') }}</h2>
      <p class="backup-settings__text">{{ t('settings.backup.android.body') }}</p>

      <h2 class="backup-settings__section">{{ t('settings.backup.copy.title') }}</h2>
      <button
        type="button"
        class="settings-row backup-settings__card backup-settings__export"
        :class="{
          'settings-row--disabled': !canExport && !hasLoadFailed,
          'settings-row--busy': isPreparing,
        }"
        :disabled="!canExport && !hasLoadFailed"
        :aria-busy="isPreparing"
        @click="exportCopy"
      >
        <v-icon class="settings-row__icon" icon="ms:ios_share" size="22" />
        <span class="settings-row__text">
          <span class="settings-row__label">{{ t('settings.backup.copy.export') }}</span>
          <span v-if="hasLoadFailed" class="settings-row__hint settings-row__hint--error">
            {{ t('settings.data.loadError') }}
          </span>
          <span v-else-if="hasNothingToExport" class="settings-row__hint">
            {{ t('settings.data.exportEmpty') }}
          </span>
          <span v-else-if="isPreparing" class="settings-row__hint" role="status">
            {{ t('settings.export.preparing') }}
          </span>
          <span v-else class="settings-row__hint">{{ t('settings.backup.copy.exportHint') }}</span>
        </span>
        <v-progress-circular
          v-if="isPreparing"
          class="settings-row__spinner"
          indeterminate
          :size="18"
          :width="2"
        />
        <v-icon
          v-else-if="canExport"
          class="settings-row__chevron"
          icon="ms:chevron_right"
          size="20"
        />
      </button>

      <p class="backup-settings__plus">
        <v-icon icon="ms:star" size="19" />
        <span>{{ t('settings.backup.plus') }}</span>
      </p>
      <button type="button" class="backup-settings__discover" @click="discoverPlus">
        <v-icon icon="ms:arrow_forward" size="18" />
        {{ t('settings.backup.discoverPlus') }}
      </button>
    </div>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.backup-settings__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px tokens.$padding-section-inline 32px;
}

.backup-settings__card {
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
}

.backup-settings__local .settings-row__label {
  font-weight: 700;
}

.backup-settings__text {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.55;
}

.backup-settings__section {
  margin: 8px 0 0;
  padding-inline: 4px;
  color: tokens.$color-text-secondary;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.backup-settings__plus {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 4px 0 0;
  padding: 12px 14px;
  border: 1px solid tokens.$color-notice-border;
  border-radius: tokens.$radius-notice;
  background: tokens.$color-notice-surface;
  color: tokens.$color-notice-text;
  font-size: 13.5px;
  line-height: 1.45;

  > .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.backup-settings__discover {
  display: flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  min-height: tokens.$size-tap-target;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  text-align: start;
  cursor: pointer;
}
</style>
