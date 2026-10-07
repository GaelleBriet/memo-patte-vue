<script setup lang="ts">
import { useI18n } from 'vue-i18n'

withDefaults(
  defineProps<{
    /** « Prochain rappel » ; `null` retire le libellé et l'échéance. */
    label: string | null
    /** « 26 août 2027 », « Aujourd’hui », « En retard depuis le 5 oct. » ; absente, `emptyText`. */
    value?: string | null
    /** « dans 11 mois ». */
    delay?: string | null
    tone?: 'today' | 'overdue' | null
    /** Ligne sous la valeur : « Aucune injection notée ». */
    note?: string | null
    emptyText?: string | null
    doneAriaLabel: string
    otherDateAriaLabel?: string | null
    busy?: boolean
    actions?: boolean
  }>(),
  {
    value: null,
    delay: null,
    tone: null,
    note: null,
    emptyText: null,
    otherDateAriaLabel: null,
    busy: false,
    actions: true,
  },
)

const emit = defineEmits<{
  done: []
  otherDate: []
}>()

defineSlots<{
  /** Ligne au-dessus de l'échéance, séparée par un filet. */
  top?(): unknown
}>()

const { t } = useI18n()
</script>

<template>
  <section class="next-due-card">
    <div v-if="$slots.top" class="next-due-card__top">
      <slot name="top" />
    </div>
    <template v-if="label !== null">
      <p class="next-due-card__label">{{ label }}</p>
      <p v-if="value" class="next-due-card__due">
        <span class="next-due-card__value" :class="tone ? `next-due-card__value--${tone}` : null">{{
          value
        }}</span>
        <span v-if="delay" class="next-due-card__delay">{{ delay }}</span>
      </p>
      <p v-else class="next-due-card__empty">{{ emptyText }}</p>
      <p v-if="value && note" class="next-due-card__note">{{ note }}</p>
    </template>
    <div v-if="actions" class="next-due-card__actions">
      <v-btn
        class="next-due-card__done"
        variant="flat"
        color="primary"
        prepend-icon="ms:check"
        :aria-label="doneAriaLabel"
        :disabled="busy"
        @click="emit('done')"
      >
        {{ t('history.done') }}
      </v-btn>
      <button
        type="button"
        class="next-due-card__other-date"
        :aria-label="otherDateAriaLabel ?? undefined"
        :disabled="busy"
        @click="emit('otherDate')"
      >
        {{ t('reminderSheet.doneOtherDay') }}
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.next-due-card {
  margin-inline: tokens.$padding-section-inline;
  padding: 18px 20px 20px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
}

.next-due-card__top {
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid tokens.$color-divider;
}

.next-due-card__top:last-child {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: 0;
}

.next-due-card__label {
  margin: 0;
  color: tokens.$color-text-meta;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.next-due-card__due {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 10px;
  margin: 4px 0 0;
}

.next-due-card__value {
  color: rgb(var(--v-theme-primary));
  font-family: tokens.$font-family-heading;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
}

.next-due-card__value--today {
  color: rgb(var(--v-theme-on-today-container));
}

.next-due-card__value--overdue {
  color: rgb(var(--v-theme-on-overdue-container));
  font-size: 20px;
}

.next-due-card__delay {
  color: tokens.$color-text-secondary;
  font-size: 14px;
  font-weight: 500;
}

.next-due-card__note {
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  font-weight: 500;
}

.next-due-card__empty {
  margin: 6px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 15px;
  font-weight: 600;
}

.next-due-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin-top: 16px;
}

.next-due-card__done {
  flex: 0 0 auto;
  height: 48px;
  padding-inline: 22px;
  border-radius: tokens.$radius-pill;
  font-size: 15.5px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.next-due-card__other-date {
  min-height: tokens.$size-tap-target;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: none;
    text-decoration-thickness: 2px;
  }
}
</style>
