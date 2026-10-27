<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import type { FinishedTreatmentRow } from '../logic/treatment-carnet'
import ListRowIcon from '@/shared/components/ListRowIcon.vue'

const props = defineProps<{
  animalId: string
  rows: readonly FinishedTreatmentRow[]
}>()

const { t } = useI18n()
const router = useRouter()

const showsFinished = ref(false)

watch(
  () => props.animalId,
  () => {
    showsFinished.value = false
  },
)

function openDetail(id: string): void {
  void router.push({ name: 'treatment-detail', params: { id } })
}
</script>

<template>
  <section v-if="rows.length > 0" class="finished-treatments">
    <h2 class="finished-treatments__heading">
      <button
        type="button"
        class="finished-treatments__toggle"
        :aria-expanded="showsFinished"
        @click="showsFinished = !showsFinished"
      >
        <span class="finished-treatments__title">{{ t('treatments.finished.title') }}</span>
        <span class="finished-treatments__counter">{{ rows.length }}</span>
        <v-icon
          class="finished-treatments__chevron"
          :icon="showsFinished ? 'ms:keyboard_arrow_up' : 'ms:keyboard_arrow_down'"
          size="24"
        />
      </button>
    </h2>
    <div v-if="showsFinished" class="section-card__card">
      <button
        v-for="row in rows"
        :key="row.id"
        type="button"
        class="section-card__row finished-treatment-row"
        @click="openDetail(row.id)"
      >
        <ListRowIcon :icon="row.icon" muted />
        <span class="finished-treatment-row__text">
          <span class="finished-treatment-row__name">{{ row.name }}</span>
          <span class="finished-treatment-row__detail">{{ row.detail }}</span>
        </span>
        <v-icon class="finished-treatment-row__chevron" icon="ms:chevron_right" size="22" />
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.finished-treatment-row {
  padding-inline-end: 12px;
}

.finished-treatment-row__chevron {
  flex: 0 0 auto;
  margin-inline-start: auto;
  color: tokens.$color-settings-chevron;
}

.finished-treatments {
  padding-inline: tokens.$padding-section-inline;
}

.finished-treatments__heading {
  margin: 0 0 12px;
}

.finished-treatments__toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: tokens.$size-tap-target;
  padding: 0;
  border: 0;
  background: transparent;
  color: tokens.$color-text-secondary;
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    color: rgb(var(--v-theme-on-surface));
  }
}

.finished-treatments__title {
  flex: 1 1 auto;
  font-family: tokens.$font-family-heading;
  font-size: 21px;
  font-weight: 700;
}

.finished-treatments__counter {
  color: tokens.$color-text-meta;
  font-size: 13px;
  font-weight: 500;
}

.finished-treatments__chevron {
  color: rgb(var(--v-theme-primary));
}

.finished-treatment-row__text {
  flex: 1 1 auto;
  min-width: 0;
}

.finished-treatment-row__name {
  display: block;
  overflow-wrap: break-word;
  color: tokens.$color-text-secondary;
  font-size: 15.5px;
  font-weight: 700;
}

.finished-treatment-row__detail {
  display: block;
  margin-top: 2px;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
}
</style>
