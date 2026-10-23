<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { usePhotosDownloading } from '@/core/sync/service/photo-restore-status'

const { t } = useI18n()
const isDownloading = usePhotosDownloading()
</script>

<template>
  <p class="home-photos-status" role="status">
    <span v-if="isDownloading" class="home-photos-status__line">
      <v-icon icon="ms:cloud_download" size="14" />
      <span class="home-photos-status__text">{{ t('home.photosDownloading') }}</span>
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
  top: 0;
  inset-inline: tokens.$padding-section-inline;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: tokens.$color-text-secondary;
  font-size: 12px;
  line-height: 1.15;
  pointer-events: none;

  > .v-icon {
    flex: 0 0 auto;
    width: 14px;
    height: 14px;
    font-size: 14px;
  }
}

.home-photos-status__text {
  min-width: 0;
  padding-bottom: 0.2em;
  margin-bottom: -0.2em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
