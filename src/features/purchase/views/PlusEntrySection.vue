<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { usePlusStatusText } from '../composables/use-plus-status-text'
import SettingsRubricRow from '@/shared/components/SettingsRubricRow.vue'

const { t } = useI18n()
const status = usePlusStatusText()
const hint = computed(() => status.value ?? t('plus.settings.summary'))
</script>

<template>
  <SettingsRubricRow
    class="settings-row--plus"
    icon="ms:star"
    :label="t('plus.title')"
    :hint="hint"
    :to="{ name: 'settings-plus' }"
  />
</template>
