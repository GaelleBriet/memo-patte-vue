<script setup lang="ts">
import { computed, onMounted, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAppResume } from '@/core/app-lifecycle/app-resume'
import { currentLocale } from '@/core/i18n'
import { openNotificationSettings } from '@/core/notifications/permission'
import { remindersHelpUrl } from '@/shared/domain/help-page'
import { primingRouteFrom } from '@/shared/domain/notification-priming'
import { showToast } from '@/shared/utils/toast'
import {
  homeMessagePlace,
  homeMessageView,
  type HomeMessageAction,
  type HomeMessagePlace,
} from '../logic/home-messages'
import { useHomeMessagesStore } from '../store/home-messages.store'

const props = defineProps<{ place: HomeMessagePlace }>()

const { t } = useI18n()
const router = useRouter()
const store = useHomeMessagesStore()
const titleId = useId()

const view = computed(() => {
  const message = store.message
  return message && homeMessagePlace(message) === props.place ? homeMessageView(t, message) : null
})
const helpUrl = computed(() => remindersHelpUrl(currentLocale()))

onMounted(() => void store.refresh())
useAppResume(() => void store.refresh())

async function exportCopy(): Promise<void> {
  if (store.isSharing) return
  const outcome = await store.shareCopy()
  if (outcome === 'shared') showToast(t('settings.export.success'))
  else if (outcome === 'failed') showToast(t('settings.export.error'), { tone: 'error' })
}

const ACTIONS: Record<HomeMessageAction, () => void> = {
  androidSettings: () => void openNotificationSettings(),
  priming: () => void router.push(primingRouteFrom('home')),
  closeRemindersOff: () => store.closeRemindersOff(),
  seeHow: () => {
    store.closeProtect()
    void router.push({ name: 'settings-backup' })
  },
  closeProtect: () => store.closeProtect(),
  exportCopy: () => void exportCopy(),
  discoverPlus: () => void router.push({ name: 'plus' }),
  stopQuarterly: () => store.stopQuarterly(),
  closeQuarterly: () => store.closeQuarterly(),
}
</script>

<template>
  <aside v-if="view?.kind === 'remindersOff'" class="home-reminders-off">
    <v-icon class="home-reminders-off__icon" icon="ms:notifications_off" size="19" />
    <div class="home-reminders-off__text">
      <button
        type="button"
        class="home-reminders-off__enable"
        @click="ACTIONS[view.enable.action]()"
      >
        <span class="home-reminders-off__title">{{ view.title }}</span>
        <span class="home-reminders-off__link">
          <span>{{ view.enable.label }}</span>
          <v-icon icon="ms:chevron_right" size="16" />
        </span>
      </button>
      <a
        class="home-reminders-off__help"
        :href="helpUrl"
        target="_blank"
        rel="noopener"
        :aria-label="view.help.ariaLabel"
      >
        {{ view.help.label }}
      </a>
    </div>
    <button
      type="button"
      class="home-reminders-off__close"
      :aria-label="view.close.label"
      @click="ACTIONS[view.close.action]()"
    >
      <v-icon icon="ms:close" size="19" />
    </button>
  </aside>

  <section
    v-else-if="view"
    class="home-message"
    :class="`home-message--${view.kind}`"
    :aria-labelledby="titleId"
  >
    <div class="home-message__head">
      <span class="home-message__icon">
        <v-icon :icon="view.icon" size="21" />
      </span>
      <div class="home-message__text">
        <p :id="titleId" class="home-message__title">{{ view.title }}</p>
        <p v-if="view.body" class="home-message__body">{{ view.body }}</p>
      </div>
      <button
        type="button"
        class="home-message__close"
        :aria-label="view.close.label"
        @click="ACTIONS[view.close.action]()"
      >
        <v-icon icon="ms:close" size="19" />
      </button>
    </div>

    <div class="home-message__actions">
      <v-btn
        v-for="button in view.buttons"
        :key="button.action"
        :class="`home-message__action home-message__action--${button.action}`"
        :variant="button.variant"
        :color="button.variant === 'flat' ? 'primary' : undefined"
        :loading="button.action === 'exportCopy' && store.isSharing"
        :aria-label="button.ariaLabel"
        @click="ACTIONS[button.action]()"
      >
        {{ button.label }}
      </v-btn>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.home-reminders-off {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 18px 20px 0;
  padding: 12px 4px 2px 14px;
  border: 1px solid tokens.$color-reminders-off-border;
  border-radius: 14px;
  background: tokens.$color-reminders-off-surface;
}

.home-reminders-off__icon {
  flex: 0 0 auto;
  margin-top: 1px;
  color: tokens.$color-text-secondary;
}

.home-reminders-off__text {
  flex: 1;
  min-width: 0;
}

.home-reminders-off__enable {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
  }
}

.home-reminders-off__title {
  color: tokens.$color-reminders-off-text;
  font-size: 13px;
  font-weight: 700;
}

.home-reminders-off__link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: 3px;
  color: rgb(var(--v-theme-primary));
  font-size: 12.5px;
  font-weight: 700;
}

.home-reminders-off__help {
  display: flex;
  align-items: center;
  min-height: 44px;
  color: rgb(var(--v-theme-primary));
  font-size: 12.5px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;

  &:focus-visible {
    outline: none;
  }
}

.home-reminders-off__close,
.home-message__close {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 0;
  background: transparent;
  color: tokens.$color-text-secondary;
  cursor: pointer;

  &:focus-visible {
    outline: none;
  }
}

.home-reminders-off__close {
  margin-block: -10px;
}

.home-message {
  margin: 18px 20px 0;
  padding: 16px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
}

.home-message__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.home-message__icon {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: tokens.$color-home-message-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.home-message__text {
  flex: 1;
  min-width: 0;
  padding-top: 2px;
}

.home-message__title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
  line-height: 1.35;
  text-wrap: pretty;
}

.home-message__body {
  margin: 4px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 13px;
  line-height: 1.45;
}

.home-message__close {
  margin: -10px -10px 0 0;
}

.home-message__actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;

  .v-btn {
    height: 48px;
    border-radius: 999px;
    font-size: 14.5px;
    font-weight: 700;
    letter-spacing: normal;
    text-transform: none;
  }

  .v-btn--variant-outlined {
    border-width: 1.5px;
    color: rgb(var(--v-theme-primary));
  }
}

.home-message__action--stopQuarterly.v-btn {
  color: tokens.$color-text-secondary;
}
</style>
