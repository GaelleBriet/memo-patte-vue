<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import ManageSubscriptionSection from './ManageSubscriptionSection.vue'
import { usePurchaseStore } from './purchase.store'
import { formatNumericDate } from '@/shared/format'
import SectionCard from '@/shared/SectionCard.vue'
import { signInRoute } from '@/shared/sign-in-route'
import { showToast } from '@/shared/toast'

const { t } = useI18n()
const router = useRouter()
const purchase = usePurchaseStore()

const isRestoring = ref(false)

const statusHint = computed<string | null>(() => {
  const expired = purchase.expiredPlan
  if (expired !== null) {
    return expired === 'monthly'
      ? t('plus.settings.status.expiredMonthly')
      : t('plus.settings.status.expiredAnnual')
  }
  const { plan, expiresAt } = purchase.status
  if (plan === 'none') return null
  if (plan === 'lifetime') return t('plus.settings.status.lifetime')
  if (expiresAt === null)
    return plan === 'monthly' ? t('plus.member.monthly') : t('plus.member.annual')
  const date = formatNumericDate(expiresAt)
  return plan === 'monthly'
    ? t('plus.settings.status.monthly', { date })
    : t('plus.settings.status.annual', { date })
})

const isPaused = computed(() => purchase.expiredPlan !== null)
const canDiscover = computed(() => statusHint.value === null)
const canRestore = computed(
  () => purchase.available && purchase.status.plan === 'none' && !isPaused.value,
)

function openPlus(): void {
  void router.push({ name: 'plus' })
}

function openSignIn(): void {
  void router.push(signInRoute('settings'))
}

async function restore(): Promise<void> {
  isRestoring.value = true
  try {
    const status = await purchase.restore()
    showToast(status.plan === 'none' ? t('plus.restore.none') : t('plus.restore.restored'))
  } catch {
    showToast(t('plus.restore.failed'))
  } finally {
    isRestoring.value = false
  }
}
</script>

<template>
  <div class="plus-section">
    <div v-if="isPaused" class="plus-paused" role="status">
      <p class="plus-paused__body">
        <v-icon class="plus-paused__icon" icon="ms:cloud_off" size="19" />
        <span>{{ t('plus.settings.paused.body') }}</span>
      </p>
      <v-btn class="plus-paused__action" variant="flat" color="primary" @click="openPlus">
        {{ t('plus.settings.paused.action') }}
      </v-btn>
    </div>

    <SectionCard :title="t('plus.title')">
      <button
        v-if="canDiscover"
        type="button"
        class="settings-row settings-row--plus-discover"
        @click="openPlus"
      >
        <v-icon class="settings-row__icon" icon="ms:workspace_premium" size="22" />
        <span class="settings-row__text">
          <span class="settings-row__label">{{ t('plus.settings.discover') }}</span>
          <span class="settings-row__hint">{{ t('plus.settings.discoverHint') }}</span>
        </span>
        <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
      </button>
      <button
        v-else-if="statusHint"
        type="button"
        class="settings-row settings-row--plus-status"
        @click="openPlus"
      >
        <v-icon class="settings-row__icon" icon="ms:workspace_premium" size="22" />
        <span class="settings-row__text">
          <span class="settings-row__label">{{ t('plus.title') }}</span>
          <span class="settings-row__hint">{{ statusHint }}</span>
        </span>
        <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
      </button>

      <ManageSubscriptionSection />

      <button
        v-if="canRestore"
        type="button"
        class="settings-row settings-row--plus-restore"
        :class="{ 'settings-row--busy': isRestoring }"
        :disabled="isRestoring"
        :aria-busy="isRestoring"
        @click="restore"
      >
        <v-icon class="settings-row__icon" icon="ms:settings_backup_restore" size="22" />
        <span class="settings-row__text">
          <span class="settings-row__label">{{ t('plus.restore.action') }}</span>
          <span v-if="isRestoring" class="settings-row__hint" role="status">
            {{ t('plus.restore.busy') }}
          </span>
        </span>
        <v-progress-circular
          v-if="isRestoring"
          class="settings-row__spinner"
          indeterminate
          :size="18"
          :width="2"
        />
      </button>

      <button
        v-if="canDiscover"
        type="button"
        class="settings-row settings-row--plus-sign-in"
        @click="openSignIn"
      >
        <v-icon class="settings-row__icon" icon="ms:devices" size="22" />
        <span class="settings-row__text">
          <span class="settings-row__label">{{ t('plus.settings.alreadySubscribed') }}</span>
          <span class="settings-row__hint">{{ t('plus.settings.alreadySubscribedHint') }}</span>
        </span>
        <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
      </button>
    </SectionCard>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.plus-section {
  display: flex;
  flex-direction: column;
  gap: tokens.$gap-settings-sections;
}

.plus-paused {
  margin-inline: tokens.$padding-section-inline;
  padding: 14px 16px;
  border: 1px solid tokens.$color-notice-border;
  border-radius: tokens.$radius-notice;
  background: tokens.$color-notice-surface;
}

.plus-paused__body {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: 0;
  color: tokens.$color-notice-text;
  font-size: 13px;
  font-weight: 700;
  line-height: 1.4;
}

.plus-paused__icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.plus-paused__action {
  width: 100%;
  height: 44px;
  margin-top: 12px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;
}
</style>
