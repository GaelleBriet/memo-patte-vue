<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { remindersSummary } from '../logic/reminders-settings'
import { useExactReminders } from '@/core/notifications/use-exact-reminders'
import { useRemindersPermission } from '../composables/use-reminders-permission'
import AccountEntrySection from '@/features/auth/views/AccountEntrySection.vue'
import PlusEntrySection from '@/features/purchase/views/PlusEntrySection.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import SettingsRubricRow from '@/shared/components/SettingsRubricRow.vue'

const appVersion = import.meta.env.VITE_APP_VERSION

const { t } = useI18n()
const router = useRouter()
const notifications = useRemindersPermission()
const { status: exactReminders } = useExactReminders()

const remindersHint = computed(() => {
  const summary = remindersSummary(notifications.value, exactReminders.value)
  return summary && t(`settings.reminders.summary.${summary}`)
})

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
      <div class="settings-card settings__entry">
        <SettingsRubricRow
          class="settings-row--reminders"
          icon="ms:notifications"
          :label="t('settings.reminders.title')"
          :hint="remindersHint"
          :to="{ name: 'settings-reminders' }"
        />
        <SettingsRubricRow
          class="settings-row--backup"
          icon="ms:backup"
          :label="t('settings.backup.title')"
          :hint="t('settings.backup.summary')"
          :to="{ name: 'settings-backup' }"
        />
        <SettingsRubricRow
          class="settings-row--data"
          icon="ms:tune"
          :label="t('settings.data.title')"
          :hint="t('settings.data.summary')"
          :to="{ name: 'settings-data' }"
        />
        <PlusEntrySection />
        <AccountEntrySection />
        <SettingsRubricRow
          class="settings-row--privacy"
          icon="ms:lock"
          :label="t('settings.privacy.title')"
          :to="{ name: 'settings-privacy' }"
        />
        <SettingsRubricRow
          class="settings-row--help"
          icon="ms:help"
          :label="t('settings.help.title')"
          :to="{ name: 'settings-help' }"
        />
        <SettingsRubricRow
          class="settings-row--about"
          icon="ms:info"
          :label="t('settings.about.title')"
          :hint="t('settings.about.summary', { version: appVersion })"
          :to="{ name: 'settings-about' }"
        />
      </div>
    </div>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.settings__content {
  padding-block: 12px 32px;
}

.settings__entry {
  margin-inline: tokens.$padding-section-inline;
}
</style>
