<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useExportCopyAction } from '@/core/export-copy/export-copy-port'

const { t } = useI18n()
const { isPreparing, exportCopy } = useExportCopyAction()
</script>

<template>
  <v-btn
    class="export-copy-choice"
    variant="outlined"
    color="primary"
    prepend-icon="ms:ios_share"
    :loading="isPreparing"
    @click="exportCopy"
  >
    {{ t('settings.backup.copy.export') }}
  </v-btn>
</template>
