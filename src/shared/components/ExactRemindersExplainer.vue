<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import PushedScreen from './PushedScreen.vue'
import { onBackButton } from '@/core/app-lifecycle/back-button'
import { openExactRemindersSettings } from '@/core/notifications/exact-reminders'

defineProps<{
  backLabel: string
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const isOpening = ref(false)

const steps = computed(() => [
  t('notifications.exact.steps.open', { action: t('notifications.exact.open') }),
  t('notifications.exact.steps.allow'),
  t('notifications.exact.steps.back'),
])

let releaseBackButton: (() => void) | null = null

function releaseBack(): void {
  releaseBackButton?.()
  releaseBackButton = null
}

onScopeDispose(releaseBack)

watch(
  open,
  (isOpen) => {
    releaseBack()
    if (isOpen) releaseBackButton = onBackButton(close)
  },
  { immediate: true },
)

function close(): void {
  open.value = false
}

async function openSettings(): Promise<void> {
  if (isOpening.value) return
  isOpening.value = true
  try {
    await openExactRemindersSettings()
  } finally {
    isOpening.value = false
    close()
  }
}
</script>

<template>
  <v-dialog
    v-model="open"
    fullscreen
    :scrim="false"
    transition="dialog-bottom-transition"
    :aria-label="t('notifications.exact.title')"
  >
    <PushedScreen
      :title="t('notifications.exact.title')"
      :subtitle="t('notifications.exact.subtitle')"
      :back-label="backLabel"
      @back="close"
    >
      <div class="exact-reminders">
        <span class="exact-reminders__icon">
          <v-icon icon="ms:alarm" size="32" />
        </span>
        <h2 class="exact-reminders__title">{{ t('notifications.exact.heroTitle') }}</h2>
        <p class="exact-reminders__text">{{ t('notifications.exact.heroText') }}</p>

        <ol class="exact-reminders__steps">
          <li v-for="(step, index) in steps" :key="step" class="exact-reminders__step">
            <span class="exact-reminders__number" aria-hidden="true">{{ index + 1 }}</span>
            <span>{{ step }}</span>
          </li>
        </ol>

        <p class="exact-reminders__skip">{{ t('notifications.exact.skip') }}</p>
      </div>

      <template #actions>
        <div class="exact-reminders__actions">
          <v-btn
            class="exact-reminders__open"
            variant="flat"
            color="primary"
            block
            :aria-label="t('notifications.exact.openLabel')"
            :loading="isOpening"
            @click="openSettings"
          >
            {{ t('notifications.exact.open') }}
          </v-btn>
          <v-btn
            class="exact-reminders__later"
            variant="text"
            color="primary"
            block
            :disabled="isOpening"
            @click="close"
          >
            {{ t('notifications.exact.later') }}
          </v-btn>
        </div>
      </template>
    </PushedScreen>
  </v-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.exact-reminders {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px 20px 24px;
}

.exact-reminders__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border-radius: 50%;
  background: tokens.$color-exact-reminders-hero-surface;
  color: rgb(var(--v-theme-primary));
}

.exact-reminders__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1.15;
  text-wrap: pretty;
}

.exact-reminders__text {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 15px;
  line-height: 1.5;
  text-wrap: pretty;
}

.exact-reminders__steps {
  margin: 4px 0 0;
  padding: 6px 16px;
  list-style: none;
  background: rgb(var(--v-theme-surface));
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
}

.exact-reminders__step {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  font-size: 14px;
  line-height: 1.45;
  text-wrap: pretty;

  & + & {
    border-top: 1px solid tokens.$color-card-border;
  }

  > span:last-child {
    padding-top: 3px;
  }
}

.exact-reminders__number {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: rgb(var(--v-theme-primary));
  color: tokens.$color-on-primary;
  font-size: 13px;
  font-weight: 700;
}

.exact-reminders__skip {
  margin: 4px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 13.5px;
  line-height: 1.5;
  text-wrap: pretty;
}

.exact-reminders__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 20px 20px;
}

.exact-reminders__open {
  height: 52px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.exact-reminders__later {
  height: tokens.$size-tap-target;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
</style>
