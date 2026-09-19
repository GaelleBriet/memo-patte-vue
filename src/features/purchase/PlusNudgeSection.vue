<script setup lang="ts">
import { onMounted, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  markPlusNudgeShown,
  nextPlusNudge,
  stopPlusNudges,
  type PlusNudgeTrigger,
} from './plus-nudge'
import { usePurchaseStore } from './purchase.store'

const props = defineProps<{ animalCount: number }>()

const ICONS: Record<PlusNudgeTrigger, string> = {
  firstPhoto: 'ms:photo_camera',
  carnetValue: 'ms:star_shine',
  firstExport: 'ms:ios_share',
}

const { t } = useI18n()
const router = useRouter()
const purchase = usePurchaseStore()

const trigger = ref<PlusNudgeTrigger | null>(null)
const titleId = useId()

// Le compteur des trente jours part de l'affichage : sans ça, un rappel ignoré en bloquerait
// un autre indéfiniment.
onMounted(() => {
  if (!purchase.available || purchase.status.plan !== 'none') return
  if (purchase.expiredPlan !== null) return
  const next = nextPlusNudge({ animals: props.animalCount })
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
  <aside v-if="trigger" class="plus-nudge" :aria-labelledby="titleId">
    <span class="plus-nudge__icon">
      <v-icon :icon="ICONS[trigger]" size="20" />
    </span>
    <div class="plus-nudge__text">
      <p :id="titleId" class="plus-nudge__title">{{ t(`plus.nudge.${trigger}.title`) }}</p>
      <p class="plus-nudge__body">{{ t(`plus.nudge.${trigger}.body`) }}</p>
    </div>
    <div class="plus-nudge__actions">
      <button type="button" class="plus-nudge__discover" @click="discover">
        {{ t('plus.nudge.discover') }}
      </button>
      <button type="button" class="plus-nudge__stop" @click="stop">
        {{ t('plus.nudge.stop') }}
      </button>
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
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: flex-start;
  gap: 12px;
  margin-inline: tokens.$padding-section-inline;
  padding: 14px 14px 6px;
  border: 1px solid tokens.$color-notice-border;
  border-radius: tokens.$radius-notice;
  background: tokens.$color-notice-surface;
}

.plus-nudge__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 12px;
  background: tokens.$color-priming-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.plus-nudge__text {
  min-width: 0;
}

.plus-nudge__title {
  margin: 0;
  // La croix occupe 51 px du bord droit de la carte : le titre ne passe pas dessous.
  padding-inline-end: 51px;
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

// Hors de la colonne de texte : les deux libellés tiennent sur une ligne jusqu'à 320 px.
.plus-nudge__actions {
  grid-column: 1 / -1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  margin-block: -8px -6px;
  margin-inline-start: -10px;
}

.plus-nudge__discover,
.plus-nudge__stop {
  cursor: pointer;
  min-height: 48px;
  padding-inline: 10px;
  border: 0;
  background: transparent;
  font-family: inherit;
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
  cursor: pointer;
  position: absolute;
  inset-block-start: 3px;
  inset-inline-end: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  border: 0;
  background: transparent;
  color: tokens.$color-text-meta;

  &:focus-visible {
    outline: none;
  }
}
</style>
