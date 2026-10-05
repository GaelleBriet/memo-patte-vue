<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ShiftHelp } from '../logic/treatment-shift-box'

defineProps<{ help: ShiftHelp | null }>()

const checked = defineModel<boolean>({ required: true })

const { t } = useI18n()
const helpId = useId()
</script>

<template>
  <div class="treatment-shift">
    <label class="treatment-shift__box">
      <input
        v-model="checked"
        class="treatment-shift__input"
        type="checkbox"
        :aria-describedby="help ? helpId : undefined"
      />
      <span class="treatment-shift__mark" aria-hidden="true">
        <v-icon v-if="checked" icon="ms:check" size="20" />
      </span>
      <span class="treatment-shift__label">{{ t('treatments.shift.label') }}</span>
    </label>
    <p
      v-if="help"
      :id="helpId"
      class="treatment-shift__help"
      :class="{ 'treatment-shift__help--warning': help.warning }"
      aria-live="polite"
    >
      <v-icon v-if="help.warning" icon="ms:event_busy" size="18" />
      <span>{{ help.text }}</span>
    </p>
  </div>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la case vit aussi dans des feuilles téléportées hors du composant.
.treatment-shift__box {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: tokens.$size-tap-target;
  cursor: pointer;
}

.treatment-shift__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.treatment-shift__mark {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 2px solid tokens.$color-text-secondary;
  border-radius: 6px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-primary));
}

.treatment-shift__input:checked + .treatment-shift__mark {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
}

.treatment-shift__label {
  font-size: 16px;
  font-weight: 500;
}

.treatment-shift__help {
  display: flex;
  gap: 8px;
  margin: 2px 0 0 38px;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.45;

  .v-icon {
    flex: 0 0 auto;
    margin-top: 1px;
  }
}

.treatment-shift__help--warning {
  margin-left: 0;
  padding: 10px 14px;
  border: 1px solid tokens.$color-shift-warning-border;
  border-radius: 12px;
  background: tokens.$color-shift-warning-surface;
  color: tokens.$color-shift-warning-text;
}
</style>
