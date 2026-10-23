<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { usePhotosDownloading } from '@/core/sync/service/photo-restore-status'

const { t } = useI18n()
const isDownloading = usePhotosDownloading()
</script>

<template>
  <p class="home-photos-status" role="status">
    <span v-if="isDownloading" class="home-photos-status__line">
      <v-icon icon="ms:cloud_download" size="16" />
      <span>{{ t('home.photosDownloading') }}</span>
    </span>
  </p>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.home-photos-status {
  position: relative;
  height: 0;
  margin: 0;
}

.home-photos-status__line {
  position: absolute;
  top: 2px;
  inset-inline: tokens.$padding-section-inline;
  display: flex;
  align-items: center;
  gap: 6px;
  height: 16px;
  color: tokens.$color-text-secondary;
  font-size: 13px;
  line-height: 16px;
  pointer-events: none;
}
</style>
