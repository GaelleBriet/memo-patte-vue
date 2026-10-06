<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useAuthStore } from '../store/auth.store'
import SettingsRubricRow from '@/shared/components/SettingsRubricRow.vue'

const { t } = useI18n()
const auth = useAuthStore()
</script>

<template>
  <SettingsRubricRow
    v-if="auth.hasPlusAccount"
    class="settings-row--account"
    icon="ms:account_circle"
    :label="t('settings.account.title')"
    :to="{ name: 'settings-account' }"
  />
</template>
