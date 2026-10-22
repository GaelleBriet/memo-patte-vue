<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { AccountIdentity } from '../repository/auth.repository'
import SectionCard from '@/shared/components/SectionCard.vue'

defineProps<{ identity: AccountIdentity }>()

const { t } = useI18n()
</script>

<template>
  <SectionCard class="account-identity">
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
