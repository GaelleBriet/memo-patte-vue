<script setup lang="ts">
import { useId } from 'vue'

import type { PromptActionId, PromptResult, UnloggedPrompt } from '../logic/treatment-unlogged'

withDefaults(
  defineProps<{
    prompt: UnloggedPrompt
    /** `banner` : la note suit le sous-titre ; `inset` : elle ferme l'encart ; `compact` : sans note. */
    variant?: 'banner' | 'inset' | 'compact'
    /** Réponse déjà donnée : elle remplace les deux gestes. */
    result?: PromptResult | null
    busy?: boolean
  }>(),
  { variant: 'banner', result: null, busy: false },
)

const emit = defineEmits<{
  act: [action: PromptActionId]
  edit: []
}>()

const titleId = useId()
</script>

<template>
  <section class="treatment-unlogged" role="region" :aria-labelledby="titleId">
    <div class="treatment-unlogged__head">
      <v-icon class="treatment-unlogged__icon" icon="ms:pending_actions" size="22" />
      <div class="treatment-unlogged__texts">
        <p :id="titleId" class="treatment-unlogged__title">{{ prompt.title }}</p>
        <p class="treatment-unlogged__subtitle">{{ prompt.subtitle }}</p>
        <p v-if="variant === 'banner'" class="treatment-unlogged__note">{{ prompt.note }}</p>
      </div>
    </div>

    <div v-if="result" class="treatment-unlogged__result">
      <v-icon class="treatment-unlogged__result-icon" icon="ms:check_circle_fill" size="19" />
      <span class="treatment-unlogged__result-text">{{ result.text }}</span>
      <button
        type="button"
        class="treatment-unlogged__edit"
        :aria-label="result.editLabel"
        :disabled="busy"
        @click="emit('edit')"
      >
        {{ result.edit }}
      </button>
    </div>

    <div v-else class="treatment-unlogged__actions">
      <button
        v-for="action in prompt.actions"
        :key="action.id"
        type="button"
        class="treatment-unlogged__action"
        :class="`treatment-unlogged__action--${action.id}`"
        :aria-label="action.label"
        :disabled="busy"
        @click="emit('act', action.id)"
      >
        <v-icon :icon="action.icon" size="18" />
        <span>{{ action.text }}</span>
      </button>
    </div>

    <p
      v-if="variant === 'inset' && !result"
      class="treatment-unlogged__note treatment-unlogged__note--below"
    >
      {{ prompt.note }}
    </p>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.treatment-unlogged {
  padding: 14px;
  border: 1px solid tokens.$color-unlogged-border;
  border-radius: tokens.$radius-unlogged;
  background: tokens.$color-unlogged-surface;
  color: rgb(var(--v-theme-primary));
}

.treatment-unlogged__head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.treatment-unlogged__icon {
  flex: 0 0 auto;
}

.treatment-unlogged__texts {
  min-width: 0;
}

.treatment-unlogged__title {
  margin: 0;
  font-size: 14.5px;
  font-weight: 700;
}

.treatment-unlogged__subtitle {
  margin: 2px 0 0;
  font-size: 13px;
  font-weight: 500;
}

.treatment-unlogged__note {
  margin: 6px 0 0;
  color: tokens.$color-notice-text;
  font-size: 12.5px;
  line-height: 1.4;
}

.treatment-unlogged__note--below {
  margin-top: 10px;
}

.treatment-unlogged__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 12px;
}

.treatment-unlogged__action {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 0;
  min-height: tokens.$size-tap-target;
  padding: 4px;
  border: 1.5px solid rgb(var(--v-theme-primary));
  border-radius: tokens.$radius-pill;
  background: tokens.$color-field-surface;
  color: inherit;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 700;
  line-height: 1.2;
  cursor: pointer;

  .v-icon {
    flex: 0 0 auto;
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: none;
    background: rgb(var(--v-theme-surface));
  }
}

.treatment-unlogged__result {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 2px 2px 2px 12px;
  border-radius: tokens.$radius-field;
  background: tokens.$color-field-surface;
}

.treatment-unlogged__result-icon {
  flex: 0 0 auto;
}

.treatment-unlogged__result-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.35;
}

.treatment-unlogged__edit {
  flex: 0 0 auto;
  min-height: tokens.$size-tap-target;
  padding: 0 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
}
</style>
