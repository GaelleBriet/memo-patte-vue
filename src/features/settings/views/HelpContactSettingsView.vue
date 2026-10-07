<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useContactMail } from '../composables/use-contact-mail'
import { currentLocale } from '@/core/i18n'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { helpPageUrl } from '@/shared/domain/help-page'
import { returnTo } from '@/shared/utils/return-to'

const { t } = useI18n()
const router = useRouter()
const { address, unsentTopic, write, copyAddress } = useContactMail()

const helpUrl = computed(() => helpPageUrl(currentLocale()))

const isNoMailAppOpen = computed({
  get: () => unsentTopic.value !== null,
  set: (isOpen) => {
    if (!isOpen) unsentTopic.value = null
  },
})

const noMailAppTitle = computed(() =>
  unsentTopic.value === 'suggestion' ? t('settings.help.suggest') : t('settings.help.write'),
)

function goBack(): void {
  returnTo(router, { name: 'settings' })
}
</script>

<template>
  <PushedScreen
    class="help-contact"
    :title="t('settings.help.title')"
    :back-label="t('form.back')"
    @back="goBack"
  >
    <div class="help-contact__content">
      <div class="settings-card">
        <a
          class="settings-row settings-row--help-page"
          :href="helpUrl"
          target="_blank"
          rel="noopener"
        >
          <v-icon class="settings-row__icon" icon="ms:menu_book" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.help.page') }}</span>
            <span class="settings-row__hint">{{ t('settings.help.pageHint') }}</span>
          </span>
          <v-icon class="settings-row__chevron" icon="ms:open_in_new" size="20" />
        </a>
      </div>

      <div class="settings-card">
        <button type="button" class="settings-row settings-row--write" @click="write('question')">
          <v-icon class="settings-row__icon" icon="ms:mail" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.help.write') }}</span>
            <span class="settings-row__hint">{{ t('settings.help.writeHint') }}</span>
          </span>
          <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
        </button>
        <button
          type="button"
          class="settings-row settings-row--suggest"
          @click="write('suggestion')"
        >
          <v-icon class="settings-row__icon" icon="ms:lightbulb" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.help.suggest') }}</span>
            <span class="settings-row__hint">{{ t('settings.help.suggestHint') }}</span>
          </span>
          <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
        </button>
      </div>

      <p class="settings-card help-contact__mail-content">
        <v-icon class="help-contact__mail-content-icon" icon="ms:shield" size="20" />
        <span>{{ t('settings.help.mailContent') }}</span>
      </p>
    </div>

    <BottomSheet
      v-model="isNoMailAppOpen"
      :title="noMailAppTitle"
      :close-label="t('settings.help.noMailApp.close')"
    >
      <div class="help-contact__no-mail-app">
        <p class="help-contact__no-mail-app-body">{{ t('settings.help.noMailApp.body') }}</p>
        <p class="settings-card help-contact__address">
          <v-icon class="help-contact__address-icon" icon="ms:mail" size="22" />
          <span>{{ address }}</span>
        </p>
        <v-btn
          class="help-contact__copy"
          variant="flat"
          color="primary"
          prepend-icon="ms:content_copy"
          @click="copyAddress"
        >
          {{ t('settings.help.noMailApp.copy') }}
        </v-btn>
      </div>
    </BottomSheet>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.help-contact__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px tokens.$padding-section-inline 32px;
}

.help-contact__mail-content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0;
  padding: 14px 16px;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.45;
}

.help-contact__mail-content-icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.help-contact__no-mail-app-body {
  margin: 8px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.45;
}

.help-contact__address {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: tokens.$height-settings-row;
  margin: 16px 0 0;
  padding: 12px 18px;
  font-size: 15px;
  font-weight: 600;
  overflow-wrap: anywhere;
  user-select: text;
}

.help-contact__address-icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.help-contact__copy {
  width: 100%;
  height: 52px;
  margin-top: 16px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
</style>
