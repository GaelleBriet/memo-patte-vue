<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import ExportCopyChoice from '@/shared/components/ExportCopyChoice.vue'

defineEmits<{ confirm: []; cancel: [] }>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
</script>

<template>
  <ConfirmDialog
    v-model="open"
    tone="primary"
    :title="t('auth.signIn.existingData.title')"
    :text="t('auth.signIn.existingData.body')"
    :cancel-label="t('auth.signIn.existingData.cancel')"
    :confirm-label="t('auth.signIn.existingData.continue')"
    @confirm="$emit('confirm')"
    @cancel="$emit('cancel')"
  >
    <template #choices>
      <ExportCopyChoice />
    </template>
  </ConfirmDialog>
</template>
