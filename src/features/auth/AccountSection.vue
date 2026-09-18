<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAuthStore } from './auth.store'
import SectionCard from '@/shared/SectionCard.vue'
import { signInRoute } from '@/shared/sign-in-route'

const { t } = useI18n()
const router = useRouter()
const auth = useAuthStore()

const isConfirmOpen = ref(false)

async function signOut(): Promise<void> {
  isConfirmOpen.value = false
  await auth.signOut()
  await router.push(signInRoute('settings'))
}
</script>

<template>
  <SectionCard v-if="auth.hasPlusAccount" :title="t('settings.account.title')">
    <button type="button" class="settings-row settings-row--sign-out" @click="isConfirmOpen = true">
      <v-icon class="settings-row__icon" icon="ms:logout" size="22" />
      <span class="settings-row__text">
        <span class="settings-row__label">{{ t('settings.account.signOut.action') }}</span>
      </span>
    </button>

    <v-dialog
      v-model="isConfirmOpen"
      class="sign-out-confirm-overlay"
      content-class="sign-out-confirm"
      max-width="340"
      :aria-label="t('settings.account.signOut.confirm.title')"
    >
      <div class="sign-out-confirm__panel">
        <h2 class="sign-out-confirm__title">{{ t('settings.account.signOut.confirm.title') }}</h2>
        <p class="sign-out-confirm__body">{{ t('settings.account.signOut.confirm.body') }}</p>
        <div class="sign-out-confirm__actions">
          <v-btn
            class="sign-out-confirm__cancel"
            variant="text"
            color="primary"
            @click="isConfirmOpen = false"
          >
            {{ t('settings.account.signOut.confirm.cancel') }}
          </v-btn>
          <v-btn class="sign-out-confirm__submit" variant="flat" color="error" @click="signOut">
            {{ t('settings.account.signOut.confirm.submit') }}
          </v-btn>
        </div>
      </div>
    </v-dialog>
  </SectionCard>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.sign-out-confirm-overlay {
  --v-overlay-opacity: #{tokens.$opacity-overlay-scrim};

  .v-overlay__scrim {
    background: tokens.$color-overlay-scrim;
  }
}

.sign-out-confirm__panel {
  padding: 22px 22px 18px;
  border-radius: tokens.$radius-sheet;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}

.sign-out-confirm__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 19px;
  font-weight: 700;
}

.sign-out-confirm__body {
  margin: 10px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.5;
}

.sign-out-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.sign-out-confirm__actions .v-btn {
  height: 44px;
  padding-inline: 18px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;

  @include tap.tap-target;
}
</style>
