<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { usePurchaseStore } from './purchase.store'

const MANAGE_SUBSCRIPTIONS_URL = 'https://play.google.com/store/account/subscriptions'

const { t } = useI18n()
const purchase = usePurchaseStore()

const isSubscribed = computed(() => ['monthly', 'annual'].includes(purchase.status.plan))
</script>

<template>
  <a
    v-if="isSubscribed"
    class="settings-row settings-row--manage-subscription"
    :href="MANAGE_SUBSCRIPTIONS_URL"
    target="_blank"
    rel="noopener"
  >
    <v-icon class="settings-row__icon" icon="ms:credit_card" size="22" />
    <span class="settings-row__text">
      <span class="settings-row__label">{{ t('plus.terms.manage') }}</span>
    </span>
    <v-icon class="settings-row__chevron" icon="ms:open_in_new" size="20" />
  </a>
</template>
