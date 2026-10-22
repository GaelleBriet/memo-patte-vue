<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAccountIdentity } from '../composables/use-account-identity'
import AccountDeletionEntry from './AccountDeletionEntry.vue'
import AccountIdentityRow from './AccountIdentityRow.vue'
import AccountSection from './AccountSection.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import SectionCard from '@/shared/components/SectionCard.vue'
import { returnTo } from '@/shared/utils/return-to'

const { t } = useI18n()
const router = useRouter()
const { identity } = useAccountIdentity()

function goBack(): void {
  returnTo(router, { name: 'settings' })
}

function openPasswordChange(): void {
  void router.push({ name: 'settings-account-password' })
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
      <AccountIdentityRow v-if="identity" :identity="identity" />
      <template v-if="identity?.kind === 'password'">
        <h2 class="settings-section-title account-settings__section-title">
          {{ t('settings.account.signInSection') }}
        </h2>
        <SectionCard class="account-settings__sign-in">
          <button
            type="button"
            class="settings-row settings-row--change-password"
            @click="openPasswordChange"
          >
            <v-icon class="settings-row__icon" icon="ms:password" size="22" />
            <span class="settings-row__text">
              <span class="settings-row__label">{{ t('settings.account.password.action') }}</span>
            </span>
            <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
          </button>
        </SectionCard>
      </template>
      <AccountSection />
      <AccountDeletionEntry />
    </div>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.account-settings__content {
  padding-block: 12px 32px;
}

.account-settings__section-title {
  margin-inline: tokens.$padding-section-inline;
}

.account-settings__sign-in {
  margin-block: 8px 12px;
}
</style>
