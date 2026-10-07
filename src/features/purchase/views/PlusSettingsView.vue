<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import PlusSection from './PlusSection.vue'
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
    class="plus-settings"
    :title="t('plus.title')"
    :back-label="t('form.back')"
    @back="goBack"
  >
    <div class="plus-settings__content">
      <PlusSection />
    </div>
  </PushedScreen>
</template>

<style scoped lang="scss">
.plus-settings__content {
  padding-block: 12px 32px;
}
</style>
