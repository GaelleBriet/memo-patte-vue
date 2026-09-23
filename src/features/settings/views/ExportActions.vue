<script setup lang="ts">
import { computed, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import type { DeliveryMode } from '../logic/export-delivery'
import type { SaveAccess } from '../logic/export-storage-access'

const props = withDefaults(
  defineProps<{
    access: SaveAccess
    pendingMode: DeliveryMode | null
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  save: []
  share: []
  openSettings: []
}>()

const { t } = useI18n()
const noticeId = useId()

const notice = computed(() => {
  if (props.access === 'refused') return t('settings.export.storage.refused')
  if (props.access === 'blocked') return t('settings.export.storage.blocked')
  return null
})

const isBusy = computed(() => props.pendingMode !== null || props.disabled)
</script>

<template>
  <div class="export-actions">
    <div aria-live="polite">
      <div v-if="notice" class="export-actions__notice">
        <v-icon class="export-actions__notice-icon" icon="ms:folder_off" size="19" />
        <div class="export-actions__notice-body">
          <p :id="noticeId" class="export-actions__notice-text">{{ notice }}</p>
          <button
            v-if="access === 'blocked'"
            type="button"
            class="export-actions__settings"
            @click="emit('openSettings')"
          >
            {{ t('settings.export.storage.openSettings') }}
            <v-icon icon="ms:open_in_new" size="15" />
          </button>
        </div>
      </div>
    </div>

    <div
      class="export-actions__buttons"
      :class="{ 'export-actions__buttons--after-notice': notice }"
    >
      <v-btn
        class="export-actions__save"
        variant="flat"
        color="primary"
        :disabled="isBusy || access === 'blocked'"
        :aria-describedby="access === 'blocked' ? noticeId : undefined"
        @click="emit('save')"
      >
        <v-progress-circular
          v-if="pendingMode === 'save'"
          class="export-actions__spinner"
          indeterminate
          :size="18"
          :width="2"
        />
        <v-icon v-else class="export-actions__icon" icon="ms:download" size="20" />
        {{ pendingMode === 'save' ? t('settings.export.preparing') : t('settings.export.save') }}
      </v-btn>

      <v-btn
        class="export-actions__share"
        variant="outlined"
        color="primary"
        :disabled="isBusy"
        @click="emit('share')"
      >
        <v-progress-circular
          v-if="pendingMode === 'share'"
          class="export-actions__spinner"
          indeterminate
          :size="18"
          :width="2"
        />
        <v-icon v-else class="export-actions__icon" icon="ms:share" size="20" />
        {{ pendingMode === 'share' ? t('settings.export.preparing') : t('settings.export.share') }}
      </v-btn>
    </div>
  </div>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.export-actions__notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: tokens.$radius-notice;
  background: tokens.$color-notice-surface;
}

.export-actions__notice-icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.export-actions__notice-body {
  min-width: 0;
}

.export-actions__notice-text {
  margin: 0;
  color: tokens.$color-notice-text;
  font-size: 12.5px;
  font-weight: 500;
  line-height: 1.45;
}

.export-actions__settings {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 32px;
  margin-top: 4px;
  padding: 0;
  border: 0;
  background: none;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  @include tap.tap-target;
}

.export-actions__buttons {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 18px;
}

.export-actions__buttons--after-notice {
  margin-top: 14px;
}

.export-actions__buttons .v-btn {
  width: 100%;
  height: 52px;
  border-radius: tokens.$radius-pill;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.export-actions__icon,
.export-actions__spinner {
  margin-inline-end: 8px;
}

.export-actions__save:disabled,
.export-actions__save.v-btn--disabled {
  background: tokens.$color-disabled-surface;
  color: tokens.$color-disabled-text;

  .v-btn__overlay {
    opacity: 0;
  }
}
</style>
