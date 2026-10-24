<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useExportCopy } from '../composables/use-export-copy'

defineProps<{ advice?: string }>()

const { t } = useI18n()
const { hasLoadFailed, hasNothingToExport, canExport, isPreparing, exportCopy } = useExportCopy()
</script>

<template>
  <button
    type="button"
    class="settings-row backup-settings__export"
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
      <span v-else class="settings-row__hint">
        {{ advice ?? t('settings.backup.copy.exportHint') }}
      </span>
    </span>
    <v-progress-circular
      v-if="isPreparing"
      class="settings-row__spinner"
      indeterminate
      :size="18"
      :width="2"
    />
    <v-icon v-else-if="canExport" class="settings-row__chevron" icon="ms:chevron_right" size="20" />
  </button>
</template>
