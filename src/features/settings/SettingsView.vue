<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import ExportSheet from './ExportSheet.vue'
import ImportSheet from './ImportSheet.vue'
import { promptNotificationsIfReminders } from '@/app/reminders-priming'
import { hasConsent, optIn, optOut } from '@/core/analytics'
import { useAnimalsStore } from '@/features/animals/animals.store'
import AccountSection from '@/features/auth/AccountSection.vue'
import PlusSection from '@/features/purchase/PlusSection.vue'
import PushedScreen from '@/shared/PushedScreen.vue'
import SectionCard from '@/shared/SectionCard.vue'

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()

const appVersion = import.meta.env.VITE_APP_VERSION
const isExportSheetOpen = ref(false)
const importSheet = useTemplateRef('importSheet')
const isImporting = ref(false)
const shareAnalytics = ref(hasConsent())

const hasLoadFailed = computed(() => animals.error !== null)
const hasNothingToExport = computed(() => animals.hasLoaded && animals.animals.length === 0)
const canExport = computed(() => animals.hasLoaded && animals.animals.length > 0)

function onExportRow(): void {
  if (hasLoadFailed.value) void animals.load()
  else isExportSheetOpen.value = true
}

onMounted(() => {
  if (!animals.hasLoaded) void animals.load()
})

function onImported(): void {
  void animals.load()
  void promptNotificationsIfReminders(router, 'settings')
}

function onShareAnalyticsChange(enabled: boolean | null): void {
  shareAnalytics.value = enabled === true
  void (shareAnalytics.value ? optIn() : optOut())
}

function goHome(): void {
  void router.push({ name: 'home' })
}
</script>

<template>
  <PushedScreen
    class="settings"
    :title="t('settings.title')"
    :back-label="t('form.back')"
    @back="goHome"
  >
    <div class="settings__content">
      <PlusSection />

      <AccountSection />

      <SectionCard :title="t('settings.data.title')">
        <button
          type="button"
          class="settings-row settings-row--export"
          :class="{ 'settings-row--disabled': !canExport && !hasLoadFailed }"
          :disabled="!canExport && !hasLoadFailed"
          @click="onExportRow"
        >
          <v-icon class="settings-row__icon" icon="ms:ios_share" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.data.export') }}</span>
            <span v-if="hasLoadFailed" class="settings-row__hint settings-row__hint--error">
              {{ t('settings.data.loadError') }}
            </span>
            <span v-else-if="hasNothingToExport" class="settings-row__hint">
              {{ t('settings.data.exportEmpty') }}
            </span>
          </span>
          <v-icon
            v-if="canExport"
            class="settings-row__chevron"
            icon="ms:chevron_right"
            size="20"
          />
        </button>
        <button
          type="button"
          class="settings-row settings-row--import"
          :class="{ 'settings-row--busy': isImporting }"
          :disabled="isImporting"
          :aria-busy="isImporting"
          @click="importSheet?.pickFile()"
        >
          <v-icon class="settings-row__icon" icon="ms:download" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.data.import') }}</span>
            <span v-if="isImporting" class="settings-row__hint" role="status">
              {{ t('settings.import.importing') }}
            </span>
          </span>
          <v-progress-circular
            v-if="isImporting"
            class="settings-row__spinner"
            indeterminate
            :size="18"
            :width="2"
          />
          <v-icon v-else class="settings-row__chevron" icon="ms:chevron_right" size="20" />
        </button>
      </SectionCard>

      <SectionCard :title="t('settings.privacy.title')">
        <label class="settings-row settings-row--analytics" for="settings-analytics">
          <v-icon class="settings-row__icon" icon="ms:query_stats" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.privacy.analytics') }}</span>
          </span>
          <v-switch
            id="settings-analytics"
            role="switch"
            class="settings-row__switch"
            :model-value="shareAnalytics"
            color="primary"
            inset
            size="small"
            hide-details
            density="compact"
            :ripple="false"
            @update:model-value="onShareAnalyticsChange"
          />
        </label>
      </SectionCard>

      <SectionCard :title="t('settings.about.title')">
        <div class="settings-row settings-row--version">
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.about.version') }}</span>
          </span>
          <span class="settings-row__value">{{ appVersion }}</span>
        </div>
      </SectionCard>
    </div>

    <ExportSheet v-model="isExportSheetOpen" />
    <ImportSheet ref="importSheet" v-model:busy="isImporting" @imported="onImported" />
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.settings__content {
  display: flex;
  flex-direction: column;
  gap: tokens.$gap-settings-sections;
  padding-block: 12px 32px;
}

.settings-row__switch {
  flex: 0 0 auto;
  --v-switch-inset-thumb-off-scale: 1;

  :deep(.v-switch__track) {
    min-width: 44px;
    background-color: tokens.$color-switch-track-off;
    opacity: 1;
  }

  :deep(.v-selection-control--dirty .v-switch__track) {
    background-color: rgb(var(--v-theme-primary));
  }

  :deep(.v-switch__thumb) {
    background-color: tokens.$color-switch-thumb;
    box-shadow: tokens.$shadow-switch-thumb;
  }

  :deep(.v-selection-control__input::before) {
    display: none;
  }
}
</style>
