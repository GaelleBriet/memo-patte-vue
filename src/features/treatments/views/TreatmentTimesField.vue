<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { canAddTime, withTime, withTimeChanged, withoutTime } from '../logic/treatment-form'
import { formatClockTime } from '@/shared/utils/format'

const props = defineProps<{
  modelValue: readonly string[]
  labelId: string
}>()

const emit = defineEmits<{
  'update:modelValue': [times: string[]]
}>()

const { t } = useI18n()

function add(event: Event): void {
  const input = event.target as HTMLInputElement
  emit('update:modelValue', withTime(props.modelValue, input.value))
  input.value = ''
}

function change(previous: string, event: Event): void {
  const { value } = event.target as HTMLInputElement
  emit('update:modelValue', withTimeChanged(props.modelValue, previous, value))
}

function remove(time: string): void {
  emit('update:modelValue', withoutTime(props.modelValue, time))
}
</script>

<template>
  <div class="treatment-times" role="group" :aria-labelledby="labelId">
    <span v-for="time in modelValue" :key="time" class="treatment-times__chip">
      <span class="treatment-times__time">
        <span aria-hidden="true">{{ formatClockTime(time) }}</span>
        <input
          class="treatment-times__input"
          type="time"
          :value="time"
          :aria-label="t('treatments.form.times.change', { time: formatClockTime(time) })"
          @change="change(time, $event)"
        />
      </span>
      <button
        type="button"
        class="treatment-times__remove"
        :aria-label="t('treatments.form.times.remove', { time: formatClockTime(time) })"
        @click="remove(time)"
      >
        <v-icon icon="ms:close" size="18" />
      </button>
    </span>
    <span v-if="canAddTime(modelValue)" class="treatment-times__add">
      <v-icon icon="ms:add" size="19" />
      <span aria-hidden="true">{{ t('treatments.form.times.add') }}</span>
      <input
        class="treatment-times__input treatment-times__input--add"
        type="time"
        :aria-label="t('treatments.form.times.add')"
        @change="add"
      />
    </span>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.treatment-times {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.treatment-times__chip,
.treatment-times__add {
  display: flex;
  position: relative;
  flex: 0 0 auto;
  align-items: center;
  height: tokens.$size-tap-target;
  border-radius: tokens.$radius-pill;
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
  white-space: nowrap;
}

.treatment-times__chip {
  gap: 2px;
  padding: 0 2px 0 16px;
  border: 1.5px solid rgb(var(--v-theme-primary));
  background: tokens.$color-notice-surface;
  font-size: 15px;
}

.treatment-times__time {
  display: flex;
  position: relative;
  align-items: center;
  height: 100%;
}

.treatment-times__remove {
  display: flex;
  border: 0;
  background: transparent;
  color: inherit;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: tokens.$radius-pill;
}

.treatment-times__add {
  gap: 6px;
  padding: 0 16px 0 12px;
  border: 1.5px dashed tokens.$color-priming-icon-surface;
  background: tokens.$color-field-surface;
  font-size: 14px;
}

// Le champ natif, invisible, couvre le libellé : le toucher ouvre le sélecteur d'heure du système.
.treatment-times__input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.treatment-times__input::-webkit-calendar-picker-indicator {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
</style>
