<script setup lang="ts">
import { useI18n } from 'vue-i18n'

withDefaults(
  defineProps<{
    /** « Prochain rappel », « Prochaine dose ». */
    label: string
    /** Date de l'échéance ; absente, `emptyText` la remplace. */
    date?: string | null
    /** « dans 11 mois », « en retard de 3 jours ». */
    delay?: string | null
    overdue?: boolean
    emptyText?: string | null
    doneAriaLabel: string
    busy?: boolean
  }>(),
  { date: null, delay: null, overdue: false, emptyText: null, busy: false },
)

const emit = defineEmits<{
  done: []
  edit: []
}>()

defineSlots<{
  /** Ligne au-dessus de l'échéance, séparée par un filet (fréquence d'un traitement). */
  top?(): unknown
}>()

const { t } = useI18n()
</script>

<template>
  <section class="next-due-card">
    <div v-if="$slots.top" class="next-due-card__top">
      <slot name="top" />
    </div>
    <p class="next-due-card__label">{{ label }}</p>
    <p v-if="date" class="next-due-card__due">
      <span class="next-due-card__date">{{ date }}</span>
      <span
        v-if="delay"
        class="next-due-card__delay"
        :class="{ 'next-due-card__delay--overdue': overdue }"
        >{{ delay }}</span
      >
    </p>
    <p v-else class="next-due-card__empty">{{ emptyText }}</p>
    <div class="next-due-card__actions">
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
      <v-btn
        class="next-due-card__edit"
        variant="outlined"
        color="primary"
        prepend-icon="ms:edit"
        :disabled="busy"
        @click="emit('edit')"
      >
        {{ t('reminderSheet.edit') }}
      </v-btn>
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

.next-due-card__date {
  color: rgb(var(--v-theme-primary));
  font-family: tokens.$font-family-heading;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
}

.next-due-card__delay {
  color: tokens.$color-text-secondary;
  font-size: 14px;
  font-weight: 500;
}

.next-due-card__delay--overdue {
  color: rgb(var(--v-theme-overdue));
  font-weight: 700;
}

.next-due-card__empty {
  margin: 6px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 15px;
  font-weight: 600;
}

.next-due-card__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.next-due-card__actions .v-btn {
  height: 48px;
  border-radius: tokens.$radius-pill;
  font-size: 15.5px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.next-due-card__edit {
  border-width: 1.5px;
}
</style>
