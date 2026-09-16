<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  markPlusNudgeShown,
  nextPlusNudge,
  stopPlusNudges,
  type PlusNudgeTrigger,
} from './plus-nudge'
import { usePurchaseStore } from './purchase.store'

const ICONS: Record<PlusNudgeTrigger, string> = {
  firstPhoto: 'ms:photo_camera',
  carnetValue: 'ms:star_shine',
  firstExport: 'ms:ios_share',
}

const { t } = useI18n()
const router = useRouter()
const purchase = usePurchaseStore()

const trigger = ref<PlusNudgeTrigger | null>(null)

// Le compteur des trente jours part de l'affichage : sans ça, un rappel ignoré en bloquerait
// un autre indéfiniment.
onMounted(() => {
  if (!purchase.available || purchase.status.plan !== 'none') return
  const next = nextPlusNudge()
  if (next === null) return
  markPlusNudgeShown(next)
  trigger.value = next
})

function discover(): void {
  trigger.value = null
  void router.push({ name: 'plus' })
}

function close(): void {
  trigger.value = null
}

function stop(): void {
  stopPlusNudges()
  trigger.value = null
}
</script>

<template>
  <aside v-if="trigger" class="plus-nudge" :aria-label="t('plus.title')">
    <span class="plus-nudge__icon">
      <v-icon :icon="ICONS[trigger]" size="20" />
    </span>
    <div class="plus-nudge__text">
      <p class="plus-nudge__title">{{ t(`plus.nudge.${trigger}.title`) }}</p>
      <p class="plus-nudge__body">{{ t(`plus.nudge.${trigger}.body`) }}</p>
      <div class="plus-nudge__actions">
        <button type="button" class="plus-nudge__discover" @click="discover">
          {{ t('plus.nudge.discover') }}
        </button>
        <button type="button" class="plus-nudge__stop" @click="stop">
          {{ t('plus.nudge.stop') }}
        </button>
      </div>
    </div>
    <button
      type="button"
      class="plus-nudge__close"
      :aria-label="t('plus.nudge.close')"
      @click="close"
    >
      <v-icon icon="ms:close" size="20" />
    </button>
  </aside>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.plus-nudge {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-inline: tokens.$padding-section-inline;
  padding: 14px 8px 8px 14px;
  border: 1px solid tokens.$color-notice-border;
  border-radius: tokens.$radius-notice;
  background: tokens.$color-notice-surface;
}

.plus-nudge__icon {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: tokens.$color-priming-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.plus-nudge__text {
  flex: 1 1 auto;
  min-width: 0;
}

.plus-nudge__title {
  margin: 0;
  color: tokens.$color-notice-text;
  font-size: 14px;
  font-weight: 700;
  line-height: 1.3;
}

.plus-nudge__body {
  margin: 3px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 13px;
  line-height: 1.35;
}

.plus-nudge__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-inline-start: -10px;
}

.plus-nudge__discover,
.plus-nudge__stop {
  min-height: 48px;
  padding-inline: 10px;
  font-size: 13.5px;
  text-align: start;

  &:focus-visible {
    outline: none;
  }
}

.plus-nudge__discover {
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

.plus-nudge__stop {
  color: tokens.$color-text-secondary;
}

.plus-nudge__close {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  margin-top: -10px;
  color: tokens.$color-text-meta;

  &:focus-visible {
    outline: none;
  }
}
</style>
