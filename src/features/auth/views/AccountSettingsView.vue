<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import AccountSection from './AccountSection.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { returnTo } from '@/shared/utils/return-to'

const { t } = useI18n()
const router = useRouter()

function goBack(): void {
  returnTo(router, { name: 'settings' })
}
</script>

<template>
  <PushedScreen
    class="account-settings"
    :title="t('settings.account.title')"
    :back-label="t('form.back')"
    @back="goBack"
  >
    <div class="account-settings__content">
      <AccountSection />
    </div>
  </PushedScreen>
</template>

<style scoped lang="scss">
.account-settings__content {
  padding-block: 12px 32px;
}
</style>
