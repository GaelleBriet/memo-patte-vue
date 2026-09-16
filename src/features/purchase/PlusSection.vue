<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { usePurchaseStore } from './purchase.store'
import { formatNumericDate } from '@/shared/format'
import SectionCard from '@/shared/SectionCard.vue'
import { showToast } from '@/shared/toast'

const { t } = useI18n()
const router = useRouter()
const purchase = usePurchaseStore()

const hasPlusScreen = router.hasRoute('plus')
const isRestoring = ref(false)

const statusHint = computed<string | null>(() => {
  const expired = purchase.expiredPlan
  if (expired !== null) {
    return expired === 'monthly'
      ? t('settings.plus.status.expiredMonthly')
      : t('settings.plus.status.expiredAnnual')
  }
  const { plan, expiresAt } = purchase.status
  if (plan === 'lifetime') return t('settings.plus.status.lifetime')
  if (expiresAt === null) return null
  const date = formatNumericDate(expiresAt)
  return plan === 'monthly'
    ? t('settings.plus.status.monthly', { date })
    : t('settings.plus.status.annual', { date })
})

const canDiscover = computed(() => hasPlusScreen && statusHint.value === null)
const canRestore = computed(() => purchase.available && purchase.status.plan === 'none')
const hasRows = computed(() => canDiscover.value || statusHint.value !== null || canRestore.value)

function openPlus(): void {
  void router.push({ name: 'plus' })
}

async function restore(): Promise<void> {
  isRestoring.value = true
  try {
    const status = await purchase.restore()
    showToast(
      status.plan === 'none'
        ? t('settings.plus.restore.none')
        : t('settings.plus.restore.restored'),
    )
  } catch {
    showToast(t('settings.plus.restore.failed'))
  } finally {
    isRestoring.value = false
  }
}
</script>

<template>
  <SectionCard v-if="hasRows" :title="t('settings.plus.title')">
    <button
      v-if="canDiscover"
      type="button"
      class="settings-row settings-row--plus-discover"
      @click="openPlus"
    >
      <v-icon class="settings-row__icon" icon="ms:workspace_premium" size="22" />
      <span class="settings-row__text">
        <span class="settings-row__label">{{ t('settings.plus.discover') }}</span>
        <span class="settings-row__hint">{{ t('settings.plus.discoverHint') }}</span>
      </span>
      <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
    </button>
    <div v-else-if="statusHint" class="settings-row settings-row--plus-status">
      <v-icon class="settings-row__icon" icon="ms:workspace_premium" size="22" />
      <span class="settings-row__text">
        <span class="settings-row__label">{{ t('settings.plus.title') }}</span>
        <span class="settings-row__hint">{{ statusHint }}</span>
      </span>
    </div>

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
        <span class="settings-row__label">{{ t('settings.plus.restore.action') }}</span>
        <span v-if="isRestoring" class="settings-row__hint">
          {{ t('settings.plus.restore.busy') }}
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
  </SectionCard>
</template>
