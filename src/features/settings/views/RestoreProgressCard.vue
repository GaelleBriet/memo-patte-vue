<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { restoreProgressText } from '../logic/backup-summary-text'
import type { RestoreProgress } from '@/core/sync/service/account-restore'

const props = defineProps<{ progress: RestoreProgress }>()

const { t } = useI18n()

const text = computed(() => restoreProgressText(t, props.progress))
const value = computed(() =>
  props.progress.total === 0 ? null : (100 * props.progress.done) / props.progress.total,
)
</script>

<template>
  <div class="settings-row restore-progress" role="status">
    <v-icon class="settings-row__icon" icon="ms:cloud_download" size="24" />
    <span class="settings-row__text">
      <span class="settings-row__label">{{ t('settings.restore.progress.title') }}</span>
      <span v-if="text" class="settings-row__hint">{{ text }}</span>
      <v-progress-linear
        class="restore-progress__bar"
        color="primary"
        rounded
        :indeterminate="value === null"
        :model-value="value ?? 0"
        aria-hidden="true"
      />
    </span>
  </div>
</template>

<style scoped lang="scss">
.restore-progress {
  .settings-row__label {
    font-weight: 700;
  }

  .settings-row__icon {
    color: rgb(var(--v-theme-primary));
  }
}

.restore-progress__bar {
  margin-top: 10px;
}
</style>
