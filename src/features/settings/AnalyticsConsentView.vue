<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { optIn, optOut } from '@/core/analytics'

const { t } = useI18n()
const router = useRouter()

function answer(accepted: boolean): void {
  void (accepted ? optIn() : optOut())
  void router.replace({ name: 'home' })
}
</script>

<template>
  <div class="analytics-consent">
    <div class="analytics-consent__body">
      <span class="analytics-consent__icon">
        <v-icon icon="ms:query_stats" size="30" />
      </span>
      <h1 class="analytics-consent__title">{{ t('analytics.consent.title') }}</h1>
      <p>{{ t('analytics.consent.measured') }}</p>
      <p>{{ t('analytics.consent.never') }}</p>
      <p>{{ t('analytics.consent.changeMind') }}</p>
    </div>

    <div class="analytics-consent__actions">
      <v-btn
        class="analytics-consent__choice analytics-consent__refuse"
        variant="outlined"
        color="primary"
        @click="answer(false)"
      >
        {{ t('analytics.consent.refuse') }}
      </v-btn>
      <v-btn
        class="analytics-consent__choice analytics-consent__accept"
        variant="outlined"
        color="primary"
        @click="answer(true)"
      >
        {{ t('analytics.consent.accept') }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.analytics-consent {
  display: flex;
  flex-direction: column;
  min-height: calc(100vh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px));
  min-height: calc(100dvh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px));
  padding: 48px 24px 24px;
  background: rgb(var(--v-theme-background));
}

.analytics-consent__body {
  flex: 1 1 auto;

  p {
    margin: 0 0 12px;
    color: tokens.$color-text-secondary;
    font-size: 14.5px;
    line-height: 1.7;
  }
}

.analytics-consent__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: tokens.$color-priming-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.analytics-consent__title {
  margin: 24px 0 16px;
  font-family: tokens.$font-family-heading;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.25;
}

.analytics-consent__actions {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.analytics-consent__choice {
  flex: 1 1 0;
  height: 52px;
  border-width: 1.5px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;

  :deep(.v-btn__overlay) {
    display: none;
  }
}
</style>
