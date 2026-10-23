<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { usePhotosDownloading } from '@/core/sync/service/photo-restore-status'

const { t } = useI18n()
const isDownloading = usePhotosDownloading()
</script>

<template>
  <p class="home-photos-status" role="status">
    <template v-if="isDownloading">
      <v-icon icon="ms:cloud_download" size="16" />
      <span>{{ t('home.photosDownloading') }}</span>
    </template>
  </p>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.home-photos-status {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 20px;
  margin: 6px 0 0;
  padding: 0 tokens.$padding-section-inline;
  color: tokens.$color-text-secondary;
  font-size: 13px;
  line-height: 20px;
}
</style>
