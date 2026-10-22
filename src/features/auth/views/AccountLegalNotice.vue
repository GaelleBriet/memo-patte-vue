<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { currentLocale } from '@/core/i18n'
import { privacyPolicyUrl } from '@/shared/domain/site-links'

defineProps<{ centered?: boolean }>()

const { t } = useI18n()

const policyUrl = computed(() => privacyPolicyUrl(currentLocale()))
</script>

<template>
  <div class="account-legal" :class="{ 'account-legal--centered': centered }">
    <p class="account-legal__adults">{{ t('auth.legal.adults') }}</p>

    <a class="account-legal__privacy" :href="policyUrl" target="_blank" rel="noopener">
      {{ t('auth.legal.privacy') }}
      <v-icon icon="ms:open_in_new" size="16" />
    </a>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.account-legal {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.account-legal__adults {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
  line-height: 1.55;
  text-wrap: pretty;
}

.account-legal__privacy {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  color: rgb(var(--v-theme-primary));
  font-size: 13.5px;
  font-weight: 700;
  text-decoration: none;
}

.account-legal--centered {
  .account-legal__adults {
    text-align: center;
  }

  .account-legal__privacy {
    justify-content: center;
  }
}
</style>
