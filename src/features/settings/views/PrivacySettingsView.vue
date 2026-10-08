<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { hasConsent, optIn, optOut } from '@/core/analytics'
import { currentLocale } from '@/core/i18n'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { privacyPolicyUrl } from '@/shared/domain/site-links'
import { returnTo } from '@/shared/utils/return-to'

const { t } = useI18n()
const router = useRouter()

const shareAnalytics = ref(hasConsent())

const policyUrl = computed(() => privacyPolicyUrl(currentLocale()))

function onShareAnalyticsChange(enabled: boolean | null): void {
  shareAnalytics.value = enabled === true
  void (shareAnalytics.value ? optIn() : optOut())
}

function goBack(): void {
  returnTo(router, { name: 'settings' })
}
</script>

<template>
  <PushedScreen
    class="privacy-settings"
    :title="t('settings.privacy.title')"
    :back-label="t('form.back')"
    @back="goBack"
  >
    <div class="privacy-settings__content">
      <div class="settings-card">
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
      </div>

      <div class="settings-card">
        <a
          class="settings-row settings-row--privacy-policy"
          :href="policyUrl"
          target="_blank"
          rel="noopener"
        >
          <v-icon class="settings-row__icon" icon="ms:shield" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.privacy.policy') }}</span>
            <span class="settings-row__hint">{{ t('settings.privacy.policyHint') }}</span>
          </span>
          <v-icon class="settings-row__chevron" icon="ms:open_in_new" size="20" />
        </a>
      </div>
    </div>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.privacy-settings__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px tokens.$padding-section-inline 32px;
}
</style>
