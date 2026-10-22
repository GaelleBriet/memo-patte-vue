<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { AccountIdentity } from '../repository/auth.repository'
import { useAuthStore } from '../store/auth.store'
import SectionCard from '@/shared/components/SectionCard.vue'

const { t } = useI18n()
const auth = useAuthStore()

const identity = ref<AccountIdentity | null>(null)

async function load(): Promise<void> {
  if (auth.hasPlusAccount) identity.value = await auth.accountIdentity()
}

onMounted(load)
</script>

<template>
  <SectionCard v-if="auth.hasPlusAccount && identity" class="account-identity">
    <div class="settings-row settings-row--account-identity">
      <v-icon
        class="settings-row__icon"
        :icon="identity.kind === 'google' ? 'ms:account_circle' : 'ms:mail'"
        size="22"
      />
      <span class="settings-row__text">
        <span class="settings-row__label">
          {{
            identity.kind === 'google'
              ? t('settings.account.identity.google')
              : t('settings.account.identity.email')
          }}
        </span>
        <span class="settings-row__hint account-identity__email">{{ identity.email }}</span>
      </span>
    </div>
  </SectionCard>
</template>

<style scoped lang="scss">
.account-identity {
  margin-bottom: 12px;
}

.account-identity__email {
  overflow-wrap: anywhere;
}
</style>
