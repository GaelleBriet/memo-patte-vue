<script setup lang="ts">
import { computed, onMounted, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  enableRemindersRoute,
  exactRemindersAction,
  exactRemindersRow,
} from '../logic/reminders-settings'
import type { CarnetSettings } from '../schema/carnet-settings.schema'
import { useCarnetSettingsStore } from '../store/carnet-settings.store'
import { currentLocale } from '@/core/i18n'
import { openNotificationSettings } from '@/core/notifications/permission'
import { useExactReminders } from '@/core/notifications/use-exact-reminders'
import { useRemindersPermission } from '../composables/use-reminders-permission'
import ExactRemindersExplainer from '@/shared/components/ExactRemindersExplainer.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { remindersHelpUrl } from '@/shared/domain/help-page'
import { primingRouteFrom } from '@/shared/domain/notification-priming'
import { formatClockTime } from '@/shared/utils/format'
import { returnTo } from '@/shared/utils/return-to'
import { showToast } from '@/shared/utils/toast'

const { t } = useI18n()
const router = useRouter()
const store = useCarnetSettingsStore()
const notifications = useRemindersPermission()
const { status: exact, openSettings } = useExactReminders()

const exactSwitchId = useId()
const remindBeforeId = useId()
const isExplainerOpen = ref(false)
const remindBeforeDue = ref(store.settings.remindBeforeDue)

const exactRow = computed(() => exactRemindersRow(notifications.value, exact.value))
const helpUrl = computed(() => remindersHelpUrl(currentLocale()))
const vaccineTime = computed(() => formatClockTime(store.settings.vaccineReminderTime))

watch(
  () => store.settings.remindBeforeDue,
  (value) => (remindBeforeDue.value = value),
)

onMounted(() => void store.load())

async function save(changes: Partial<CarnetSettings>): Promise<boolean> {
  try {
    await store.update(changes)
    return true
  } catch {
    showToast(t('settings.reminders.saveError'), { tone: 'error' })
    return false
  }
}

async function onRemindBeforeDueChange(value: boolean | null): Promise<void> {
  remindBeforeDue.value = value === true
  if (!(await save({ remindBeforeDue: remindBeforeDue.value }))) {
    remindBeforeDue.value = store.settings.remindBeforeDue
  }
}

async function onVaccineTimeChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  if (!input.value || !(await save({ vaccineReminderTime: input.value }))) {
    input.value = store.settings.vaccineReminderTime
  }
}

function onExactSwitch(event: Event): void {
  event.preventDefault()
  if (exactRemindersAction(exact.value) === 'androidSettings') void openSettings()
  else isExplainerOpen.value = true
}

function enableReminders(): void {
  const route = enableRemindersRoute(notifications.value)
  if (route === 'priming') void router.push(primingRouteFrom('settings-reminders'))
  else if (route === 'androidSettings') void openNotificationSettings()
}

function goBack(): void {
  returnTo(router, { name: 'settings' })
}
</script>

<template>
  <PushedScreen
    class="reminders-settings"
    :title="t('settings.reminders.title')"
    :back-label="t('form.back')"
    @back="goBack"
  >
    <div class="reminders-settings__content">
      <template v-if="notifications === 'granted'">
        <div class="settings-row reminders-settings__card reminders-settings__status">
          <v-icon class="settings-row__icon" icon="ms:notifications_active" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.reminders.granted.title') }}</span>
            <span class="settings-row__hint">{{ t('settings.reminders.granted.hint') }}</span>
          </span>
        </div>
        <button
          type="button"
          class="settings-row reminders-settings__card reminders-settings__notification-settings"
          @click="openNotificationSettings"
        >
          <v-icon class="settings-row__icon" icon="ms:tune" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">
              {{ t('settings.reminders.notificationSettings.label') }}
            </span>
            <span class="settings-row__hint">
              {{ t('settings.reminders.notificationSettings.hint') }}
            </span>
          </span>
          <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
        </button>
      </template>

      <template v-else-if="notifications === 'unasked' || notifications === 'disabled'">
        <div
          class="settings-row reminders-settings__card reminders-settings__card--neutral reminders-settings__status"
        >
          <v-icon
            class="settings-row__icon reminders-settings__neutral-icon"
            :icon="notifications === 'unasked' ? 'ms:notifications' : 'ms:notifications_off'"
            size="22"
          />
          <span class="settings-row__text">
            <span class="settings-row__label">
              {{ t(`settings.reminders.${notifications}.title`) }}
            </span>
            <span class="settings-row__hint">
              {{ t(`settings.reminders.${notifications}.hint`) }}
            </span>
          </span>
        </div>
        <v-btn
          class="reminders-settings__enable"
          variant="flat"
          color="primary"
          block
          :prepend-icon="notifications === 'unasked' ? 'ms:notifications_active' : 'ms:open_in_new'"
          @click="enableReminders"
        >
          {{ t(`settings.reminders.${notifications}.action`) }}
        </v-btn>
      </template>

      <template v-if="exactRow">
        <label
          class="settings-row reminders-settings__card reminders-settings__exact"
          :for="exactSwitchId"
        >
          <v-icon class="settings-row__icon" icon="ms:alarm" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.reminders.exact.label') }}</span>
            <span class="settings-row__hint">
              {{ t(`settings.reminders.exact.hint.${exactRow.hint}`) }}
            </span>
          </span>
          <v-switch
            :id="exactSwitchId"
            role="switch"
            class="settings-row__switch"
            :model-value="exactRow.isOn"
            color="primary"
            inset
            size="small"
            hide-details
            density="compact"
            :ripple="false"
            @click="onExactSwitch"
          />
        </label>
        <p
          v-if="exactRow.notice === 'precise'"
          class="reminders-settings__notice reminders-settings__precise"
        >
          <v-icon icon="ms:check_circle" size="19" />
          <span>{{ t('settings.reminders.exact.precise') }}</span>
        </p>
        <div
          v-else-if="exactRow.notice === 'lessPrecise'"
          class="reminders-settings__notice reminders-settings__less-precise"
        >
          <v-icon class="reminders-settings__neutral-icon" icon="ms:alarm_off" size="19" />
          <span class="reminders-settings__notice-text">
            <span>{{ t('settings.reminders.exact.lessPrecise') }}</span>
            <button
              type="button"
              class="reminders-settings__reactivate"
              @click="isExplainerOpen = true"
            >
              {{ t('settings.reminders.exact.reactivate') }}
              <v-icon icon="ms:chevron_right" size="18" />
            </button>
          </span>
        </div>
      </template>

      <template v-if="store.hasLoaded">
        <label
          class="settings-row reminders-settings__card reminders-settings__remind-before"
          :for="remindBeforeId"
        >
          <v-icon class="settings-row__icon" icon="ms:notifications_active" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">
              {{ t('settings.reminders.remindBeforeDue.label') }}
            </span>
          </span>
          <v-switch
            :id="remindBeforeId"
            role="switch"
            class="settings-row__switch"
            :model-value="remindBeforeDue"
            color="primary"
            inset
            size="small"
            hide-details
            density="compact"
            :ripple="false"
            @update:model-value="onRemindBeforeDueChange"
          />
        </label>
        <p class="reminders-settings__caption reminders-settings__remind-before-hint">
          {{ t('settings.reminders.remindBeforeDue.hint') }}
        </p>

        <div class="settings-row reminders-settings__card reminders-settings__vaccine-time">
          <v-icon class="settings-row__icon" icon="ms:schedule" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">
              {{ t('settings.reminders.vaccineTime.label') }}
            </span>
          </span>
          <span class="settings-row__value">{{ vaccineTime }}</span>
          <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
          <input
            class="reminders-settings__time-input"
            type="time"
            :value="store.settings.vaccineReminderTime"
            :aria-label="t('settings.reminders.vaccineTime.change', { time: vaccineTime })"
            @change="onVaccineTimeChange"
          />
        </div>
      </template>
      <button
        v-else-if="store.error"
        type="button"
        class="settings-row reminders-settings__card reminders-settings__retry"
        @click="store.load()"
      >
        <span class="settings-row__text">
          <span class="settings-row__hint settings-row__hint--error">
            {{ t('settings.data.loadError') }}
          </span>
        </span>
      </button>

      <a
        class="settings-row reminders-settings__card reminders-settings__help"
        :href="helpUrl"
        target="_blank"
        rel="noopener"
      >
        <v-icon class="settings-row__icon" icon="ms:help" size="22" />
        <span class="settings-row__text">
          <span class="settings-row__label">{{ t('settings.reminders.help.label') }}</span>
          <span class="settings-row__hint">{{ t('settings.reminders.help.hint') }}</span>
        </span>
        <v-icon class="settings-row__chevron" icon="ms:open_in_new" size="20" />
      </a>
    </div>

    <ExactRemindersExplainer v-model="isExplainerOpen" :back-label="t('form.back')" />
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.reminders-settings__content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px tokens.$padding-section-inline 32px;
}

.reminders-settings__card {
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
}

.reminders-settings__card + .reminders-settings__card {
  border-top: 1px solid tokens.$color-card-border;
}

.reminders-settings__card--neutral {
  border-color: transparent;
  background: tokens.$color-reminders-settings-neutral-surface;

  .settings-row__label {
    color: tokens.$color-reminders-settings-neutral-text;
  }
}

.reminders-settings__neutral-icon {
  flex: 0 0 auto;
  color: tokens.$color-text-secondary;
}

.reminders-settings__enable {
  min-height: 52px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;

  :deep(.v-btn__content) {
    white-space: normal;
  }
}

.reminders-settings__notice {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin: -4px 0 0;
  padding: 12px 16px;
  border-radius: tokens.$radius-notice;
  font-size: 14px;
  line-height: 1.45;

  > .v-icon {
    flex: 0 0 auto;
    margin-top: 1px;
  }
}

.reminders-settings__precise {
  border: 1px solid tokens.$color-notice-border;
  background: tokens.$color-notice-surface;
  color: tokens.$color-notice-text;

  > .v-icon {
    color: rgb(var(--v-theme-primary));
  }
}

.reminders-settings__less-precise {
  background: tokens.$color-reminders-settings-neutral-surface;
  color: tokens.$color-reminders-settings-neutral-text;
}

.reminders-settings__notice-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}

.reminders-settings__reactivate {
  display: inline-flex;
  position: relative;
  align-items: center;
  gap: 2px;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;

  @include tap.tap-target;
}

.reminders-settings__caption {
  margin: -6px 4px 0;
  color: tokens.$color-text-secondary;
  font-size: 13px;
  line-height: 1.45;
}

.reminders-settings__vaccine-time {
  position: relative;

  .settings-row__value {
    font-weight: 700;
    white-space: nowrap;
  }
}

// Le champ natif, invisible, couvre la ligne : la toucher ouvre le sélecteur d'heure du système.
.reminders-settings__time-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}
</style>
