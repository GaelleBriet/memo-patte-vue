<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { currentLocale } from '@/core/i18n'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { legalNoticeUrl, siteUrl, vaccineSourceUrl } from '@/shared/domain/site-links'
import { returnTo } from '@/shared/utils/return-to'

const appVersion = import.meta.env.VITE_APP_VERSION

const { t } = useI18n()
const router = useRouter()

const websiteUrl = computed(() => siteUrl(currentLocale()))
const legalNoticeLink = computed(() => legalNoticeUrl(currentLocale()))

function goBack(): void {
  returnTo(router, { name: 'settings' })
}
</script>

<template>
  <PushedScreen
    class="about-settings"
    :title="t('settings.about.title')"
    :back-label="t('form.back')"
    @back="goBack"
  >
    <div class="about-settings__content">
      <div class="settings-card">
        <div class="settings-row settings-row--version">
          <v-icon class="settings-row__icon" icon="ms:info" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.about.version') }}</span>
          </span>
          <span class="settings-row__value">{{ appVersion }}</span>
        </div>
      </div>

      <div class="settings-card">
        <a
          class="settings-row settings-row--website"
          :href="websiteUrl"
          target="_blank"
          rel="noopener"
        >
          <v-icon class="settings-row__icon" icon="ms:language" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.about.website') }}</span>
            <span class="settings-row__hint">{{ t('settings.about.websiteHint') }}</span>
          </span>
          <v-icon class="settings-row__chevron" icon="ms:open_in_new" size="20" />
        </a>
        <a
          class="settings-row settings-row--legal-notice"
          :href="legalNoticeLink"
          target="_blank"
          rel="noopener"
        >
          <v-icon class="settings-row__icon" icon="ms:gavel" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.about.legalNotice') }}</span>
          </span>
          <v-icon class="settings-row__chevron" icon="ms:open_in_new" size="20" />
        </a>
        <a
          class="settings-row settings-row--vaccine-source"
          :href="vaccineSourceUrl()"
          target="_blank"
          rel="noopener"
        >
          <v-icon class="settings-row__icon" icon="ms:vaccines" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.about.vaccineSource') }}</span>
          </span>
          <v-icon class="settings-row__chevron" icon="ms:open_in_new" size="20" />
        </a>
      </div>
    </div>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.about-settings__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px tokens.$padding-section-inline 32px;
}
</style>
