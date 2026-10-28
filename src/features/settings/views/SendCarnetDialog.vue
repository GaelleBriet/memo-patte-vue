<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'

defineProps<{ text: string }>()

defineEmits<{ confirm: []; cancel: [] }>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
</script>

<template>
  <ConfirmDialog
    v-model="open"
    tone="primary"
    solid-confirm
    :title="t('auth.signIn.sendLocal.title')"
    :text="text"
    :cancel-label="t('auth.signIn.sendLocal.cancel')"
    :confirm-label="t('auth.signIn.sendLocal.confirm')"
    @confirm="$emit('confirm')"
    @cancel="$emit('cancel')"
  />
</template>
