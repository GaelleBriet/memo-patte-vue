<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAuthStore } from '../store/auth.store'
import SectionCard from '@/shared/components/SectionCard.vue'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

function openDeletion(): void {
  void router.push({ name: 'settings-account-delete' })
}
</script>

<template>
  <SectionCard v-if="auth.hasPlusAccount" class="account-deletion-entry">
    <button type="button" class="settings-row settings-row--delete-account" @click="openDeletion">
      <v-icon class="settings-row__icon" icon="ms:person_off" size="22" />
      <span class="settings-row__text">
        <span class="settings-row__label">{{ t('settings.account.delete.action') }}</span>
      </span>
    </button>
  </SectionCard>
</template>

<style scoped lang="scss">
.account-deletion-entry {
  margin-top: 12px;
}

.settings-row--delete-account {
  .settings-row__icon,
  .settings-row__label {
    color: rgb(var(--v-theme-error));
  }
}
</style>
