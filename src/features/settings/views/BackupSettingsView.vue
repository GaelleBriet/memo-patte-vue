<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useBackupStatus } from '../composables/use-backup-status'
import { showsPhotosBackedUp, type CloudBackupStatus } from '../logic/backup-status'
import { cloudBackupText, refusedItemsText } from '../logic/backup-status-text'
import BackupCopyRow from './BackupCopyRow.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { returnTo } from '@/shared/utils/return-to'
import { signInRoute } from '@/shared/utils/sign-in-route'

const STATUS_LOOK: Record<CloudBackupStatus['kind'], { icon: string; tone: string | null }> = {
  saved: { icon: 'ms:cloud_done', tone: null },
  'first-backup': { icon: 'ms:cloud_upload', tone: null },
  'waiting-network': { icon: 'ms:cloud_sync', tone: 'backup-settings__status--neutral' },
  interrupted: { icon: 'ms:sync_problem', tone: 'backup-settings__status--warning' },
}

const { t } = useI18n()
const router = useRouter()
const { status, refused, now } = useBackupStatus()

const cloud = computed<CloudBackupStatus | null>(() =>
  status.value === null || status.value.kind === 'local' || status.value.kind === 'unread'
    ? null
    : status.value,
)
const cloudText = computed(() => cloud.value && cloudBackupText(t, cloud.value, now.value))
const cloudLook = computed(() => cloud.value && STATUS_LOOK[cloud.value.kind])
const refusedText = computed(() => (refused.value > 0 ? refusedItemsText(t, refused.value) : null))

function discoverPlus(): void {
  void router.push({ name: 'plus' })
}

function signInAgain(): void {
  void router.push(signInRoute('settings-backup'))
}

function openHelp(): void {
  void router.push({ name: 'settings-help' })
}

function openErase(): void {
  void router.push({ name: 'settings-erase' })
}

function goBack(): void {
  returnTo(router, { name: 'settings' })
}
</script>

<template>
  <PushedScreen
    class="backup-settings"
    :title="t('settings.backup.title')"
    :back-label="t('form.back')"
    @back="goBack"
  >
    <div v-if="status !== null" class="backup-settings__content">
      <template v-if="cloud && cloudText && cloudLook">
        <div
          class="settings-row backup-settings__card backup-settings__status"
          :class="cloudLook.tone"
        >
          <v-icon class="settings-row__icon" :icon="cloudLook.icon" size="24" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ cloudText.title }}</span>
            <span v-if="cloudText.hint" class="settings-row__hint">{{ cloudText.hint }}</span>
          </span>
        </div>
        <button
          v-if="refusedText"
          type="button"
          class="settings-row settings-row--multiline backup-settings__card backup-settings__refused"
          @click="openHelp"
        >
          <v-icon class="settings-row__icon" icon="ms:error" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ refusedText }}</span>
          </span>
          <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
        </button>
        <v-btn
          v-if="cloud.kind === 'interrupted'"
          class="backup-settings__sign-in"
          variant="flat"
          color="primary"
          block
          prepend-icon="ms:login"
          @click="signInAgain"
        >
          {{ t('settings.backup.cloud.interrupted.signIn') }}
        </v-btn>
        <div
          v-if="showsPhotosBackedUp(cloud)"
          class="settings-row backup-settings__card backup-settings__photos"
        >
          <v-icon class="settings-row__icon" icon="ms:photo_library" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.backup.cloud.photos.label') }}</span>
          </span>
          <span class="settings-row__value">{{ t('settings.backup.cloud.photos.value') }}</span>
        </div>
        <BackupCopyRow
          class="backup-settings__card"
          :advice="
            cloud.kind === 'interrupted'
              ? t('settings.backup.cloud.interrupted.exportHint')
              : undefined
          "
        />
      </template>

      <template v-else-if="status.kind === 'local'">
        <div class="settings-row backup-settings__card backup-settings__local">
          <v-icon class="settings-row__icon" icon="ms:mobile" size="24" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.backup.local.title') }}</span>
            <span class="settings-row__hint">{{ t('settings.backup.local.hint') }}</span>
          </span>
        </div>
        <p class="backup-settings__text">{{ t('settings.backup.risk') }}</p>

        <h2 class="backup-settings__section">{{ t('settings.backup.android.title') }}</h2>
        <p class="backup-settings__text">{{ t('settings.backup.android.body') }}</p>

        <h2 class="backup-settings__section">{{ t('settings.backup.copy.title') }}</h2>
        <BackupCopyRow class="backup-settings__card" />

        <p class="backup-settings__plus">
          <v-icon icon="ms:star" size="19" />
          <span>{{ t('settings.backup.plus') }}</span>
        </p>
        <button type="button" class="backup-settings__discover" @click="discoverPlus">
          <v-icon icon="ms:arrow_forward" size="18" />
          {{ t('settings.backup.discoverPlus') }}
        </button>
      </template>

      <BackupCopyRow v-else class="backup-settings__card" />

      <button
        type="button"
        class="settings-row settings-row--multiline backup-settings__card backup-settings__erase"
        @click="openErase"
      >
        <v-icon class="settings-row__icon" icon="ms:delete_forever" size="22" />
        <span class="settings-row__text">
          <span class="settings-row__label">{{ t('settings.erase.title') }}</span>
          <span v-if="cloud" class="settings-row__hint">
            {{ t('settings.backup.cloud.eraseHint') }}
          </span>
        </span>
        <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
      </button>
    </div>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.backup-settings__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px tokens.$padding-section-inline 32px;
}

.backup-settings__card {
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
}

.backup-settings__local .settings-row__label,
.backup-settings__status .settings-row__label {
  font-weight: 700;
}

.backup-settings__status--neutral {
  border-color: transparent;
  background: tokens.$color-backup-status-neutral-surface;

  .settings-row__icon {
    color: tokens.$color-text-secondary;
  }
}

.backup-settings__status--warning {
  border-color: transparent;
  background: rgb(var(--v-theme-warning-container));

  .settings-row__icon,
  .settings-row__label {
    color: rgb(var(--v-theme-warning));
  }
}

.backup-settings__refused .settings-row__icon {
  color: rgb(var(--v-theme-warning));
}

.backup-settings__sign-in {
  min-height: 52px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.backup-settings__text {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.55;
}

.backup-settings__section {
  margin: 8px 0 0;
  padding-inline: 4px;
  color: tokens.$color-text-secondary;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.backup-settings__plus {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 4px 0 0;
  padding: 12px 14px;
  border: 1px solid tokens.$color-notice-border;
  border-radius: tokens.$radius-notice;
  background: tokens.$color-notice-surface;
  color: tokens.$color-notice-text;
  font-size: 13.5px;
  line-height: 1.45;

  > .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.backup-settings__erase {
  margin-top: 8px;

  .settings-row__icon,
  .settings-row__label {
    color: rgb(var(--v-theme-error));
  }
}

.backup-settings__discover {
  display: flex;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  min-height: tokens.$size-tap-target;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  text-align: start;
  cursor: pointer;
}
</style>
