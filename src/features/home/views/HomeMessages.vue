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
import type { HomeMessageKind } from '../logic/home-messages'
import { useHomeMessagesStore } from '../store/home-messages.store'

const props = defineProps<{ place: 'aboveTodo' | 'belowTodo' }>()

const PLACES: Record<HomeMessageKind, 'aboveTodo' | 'belowTodo'> = {
  remindersOff: 'aboveTodo',
  protect: 'belowTodo',
  quarterly: 'belowTodo',
}

const { t } = useI18n()
const router = useRouter()
const store = useHomeMessagesStore()
const titleId = useId()

const message = computed(() => {
  const current = store.message
  return current && PLACES[current.kind] === props.place ? current : null
})
const helpUrl = computed(() => remindersHelpUrl(currentLocale()))

onMounted(() => void store.refresh())
useAppResume(() => void store.refresh())

function enableReminders(): void {
  if (message.value?.kind !== 'remindersOff') return
  if (message.value.enable === 'priming') void router.push(primingRouteFrom('home'))
  else void openNotificationSettings()
}

function seeHowToProtect(): void {
  store.closeProtect()
  void router.push({ name: 'settings-backup' })
}

async function exportCopy(): Promise<void> {
  if (store.isSharing) return
  const outcome = await store.shareCopy()
  if (outcome === 'shared') showToast(t('settings.export.success'))
  else if (outcome === 'failed') showToast(t('settings.export.error'), { tone: 'error' })
}

function discoverPlus(): void {
  void router.push({ name: 'plus' })
}
</script>

<template>
  <aside v-if="message?.kind === 'remindersOff'" class="home-reminders-off">
    <v-icon class="home-reminders-off__icon" icon="ms:notifications_off" size="19" />
    <div class="home-reminders-off__text">
      <button type="button" class="home-reminders-off__enable" @click="enableReminders">
        <span class="home-reminders-off__title">{{ t('notifications.disabled.title') }}</span>
        <span class="home-reminders-off__link">
          <span>
            {{
              message.enable === 'priming'
                ? t('notifications.disabled.enable')
                : t('notifications.disabled.openSettings')
            }}
          </span>
          <v-icon icon="ms:chevron_right" size="16" />
        </span>
      </button>
      <a
        class="home-reminders-off__help"
        :href="helpUrl"
        target="_blank"
        rel="noopener"
        :aria-label="t('notifications.disabled.helpLabel')"
      >
        {{ t('notifications.disabled.help') }}
      </a>
    </div>
    <button
      type="button"
      class="home-reminders-off__close"
      :aria-label="t('home.messages.close')"
      @click="store.closeRemindersOff()"
    >
      <v-icon icon="ms:close" size="19" />
    </button>
  </aside>

  <section
    v-else-if="message"
    class="home-message"
    :class="`home-message--${message.kind}`"
    :aria-labelledby="titleId"
  >
    <div class="home-message__head">
      <span class="home-message__icon">
        <v-icon :icon="message.kind === 'protect' ? 'ms:mobile' : 'ms:shield'" size="21" />
      </span>
      <div class="home-message__text">
        <p :id="titleId" class="home-message__title">
          {{
            message.kind === 'quarterly'
              ? t('home.messages.quarterly.title')
              : t('home.messages.protect.title')
          }}
        </p>
        <p v-if="message.kind === 'quarterly'" class="home-message__body">
          {{ t('home.messages.quarterly.body') }}
        </p>
      </div>
      <button
        type="button"
        class="home-message__close"
        :aria-label="
          message.kind === 'quarterly'
            ? t('home.messages.quarterly.close')
            : t('home.messages.close')
        "
        @click="message.kind === 'quarterly' ? store.closeQuarterly() : store.closeProtect()"
      >
        <v-icon icon="ms:close" size="19" />
      </button>
    </div>

    <div class="home-message__actions">
      <v-btn
        v-if="message.kind === 'protect'"
        class="home-message__see-how"
        variant="outlined"
        :aria-label="t('home.messages.protect.seeHowLabel')"
        @click="seeHowToProtect"
      >
        {{ t('home.messages.protect.seeHow') }}
      </v-btn>
      <template v-else>
        <v-btn
          class="home-message__export"
          variant="flat"
          color="primary"
          :loading="store.isSharing"
          :aria-label="t('home.messages.quarterly.exportLabel')"
          @click="exportCopy"
        >
          {{ t('settings.backup.copy.export') }}
        </v-btn>
        <v-btn
          class="home-message__plus"
          variant="outlined"
          :aria-label="t('home.messages.quarterly.plusLabel')"
          @click="discoverPlus"
        >
          {{ t('home.messages.quarterly.plus') }}
        </v-btn>
        <v-btn
          class="home-message__stop"
          variant="text"
          :aria-label="t('home.messages.quarterly.stopLabel')"
          @click="store.stopQuarterly()"
        >
          {{ t('home.messages.quarterly.stop') }}
        </v-btn>
      </template>
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

.home-message__stop.v-btn {
  color: tokens.$color-text-secondary;
}
</style>
