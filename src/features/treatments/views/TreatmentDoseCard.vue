<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { DoseCard } from '../logic/treatment-card'
import type { Due } from '@/shared/domain/treatment-schedule'

withDefaults(defineProps<{ card: DoseCard; busy?: boolean }>(), { busy: false })

const emit = defineEmits<{
  done: [due: Due]
  otherDate: []
}>()

const { t } = useI18n()
</script>

<template>
  <section
    class="treatment-dose-card"
    :class="{ 'treatment-dose-card--several': card.entries.length > 1 }"
  >
    <div v-if="card.rhythm" class="treatment-dose-card__settings">
      <p class="treatment-dose-card__setting treatment-dose-card__setting--rhythm">
        <v-icon icon="ms:repeat" size="20" />
        <span>{{ card.rhythm }}</span>
      </p>
      <p
        v-if="card.dosage"
        class="treatment-dose-card__setting treatment-dose-card__setting--dosage"
      >
        <v-icon icon="ms:pill" size="20" />
        <span>{{ card.dosage }}</span>
      </p>
    </div>

    <div v-if="card.end" class="treatment-dose-card__dose">
      <p v-if="card.end.label" class="treatment-dose-card__label">{{ card.end.label }}</p>
      <p v-if="card.end.value" class="treatment-dose-card__value treatment-dose-card__value--end">
        {{ card.end.value }}
      </p>
    </div>

    <template v-else>
      <div
        v-for="entry in card.entries"
        :key="`${entry.due.dueOn} ${entry.due.dueTime}`"
        class="treatment-dose-card__entry"
      >
        <div class="treatment-dose-card__dose">
          <p v-if="entry.label" class="treatment-dose-card__label">{{ entry.label }}</p>
          <p
            class="treatment-dose-card__value"
            :class="{ 'treatment-dose-card__value--overdue': entry.overdue }"
          >
            {{ entry.value }}
          </p>
        </div>
        <div class="treatment-dose-card__actions">
          <v-btn
            class="treatment-dose-card__done"
            variant="flat"
            color="primary"
            prepend-icon="ms:check"
            :aria-label="entry.doneLabel"
            :disabled="busy"
            @click="emit('done', entry.due)"
          >
            {{ t('history.done') }}
          </v-btn>
          <button
            v-if="card.entries.length === 1"
            type="button"
            class="treatment-dose-card__other-date"
            :disabled="busy"
            @click="emit('otherDate')"
          >
            {{ t('reminderSheet.doneOtherDay') }}
          </button>
        </div>
      </div>
      <button
        v-if="card.entries.length > 1"
        type="button"
        class="treatment-dose-card__other-date treatment-dose-card__other-date--below"
        :disabled="busy"
        @click="emit('otherDate')"
      >
        {{ t('reminderSheet.doneOtherDay') }}
      </button>
    </template>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.treatment-dose-card {
  margin-inline: tokens.$padding-section-inline;
  padding: 18px 20px 20px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
}

.treatment-dose-card__settings {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 14px;
  padding-bottom: 14px;
  border-bottom: 1px solid tokens.$color-divider;
}

.treatment-dose-card__setting {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 15px;
  font-weight: 600;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.treatment-dose-card__label {
  margin: 0;
  color: tokens.$color-text-meta;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.treatment-dose-card__value {
  margin: 4px 0 0;
  color: rgb(var(--v-theme-primary));
  font-family: tokens.$font-family-heading;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.2;
}

.treatment-dose-card__value--overdue {
  color: rgb(var(--v-theme-overdue));
}

.treatment-dose-card__value--end {
  color: rgb(var(--v-theme-on-surface));
  font-size: 20px;
}

.treatment-dose-card__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 12px;
  margin-top: 16px;
}

.treatment-dose-card__done {
  flex: 0 0 auto;
  height: 48px;
  padding-inline: 22px;
  border-radius: tokens.$radius-pill;
  font-size: 15.5px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.treatment-dose-card__other-date {
  min-height: tokens.$size-tap-target;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 14.5px;
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

.treatment-dose-card--several {
  .treatment-dose-card__entry {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 10px;
  }

  .treatment-dose-card__entry + .treatment-dose-card__entry {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid tokens.$color-divider;
  }

  .treatment-dose-card__value {
    font-size: 21px;
  }

  .treatment-dose-card__actions {
    margin-top: 0;
  }

  .treatment-dose-card__done {
    padding-inline: 16px;
  }
}

.treatment-dose-card__other-date--below {
  margin-top: 8px;
  padding-inline: 0;
}
</style>
