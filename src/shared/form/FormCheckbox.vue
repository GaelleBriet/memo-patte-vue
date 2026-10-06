<script setup lang="ts">
import { useId } from 'vue'

defineProps<{
  label: string
  help?: string | null
  disabled?: boolean
}>()

const checked = defineModel<boolean>({ required: true })

const helpId = useId()
</script>

<template>
  <div class="form-checkbox" :class="{ 'form-checkbox--disabled': disabled }">
    <label class="form-checkbox__box">
      <input
        v-model="checked"
        class="form-checkbox__input"
        type="checkbox"
        :disabled="disabled"
        :aria-describedby="help ? helpId : undefined"
      />
      <span class="form-checkbox__mark" aria-hidden="true">
        <v-icon v-if="checked" icon="ms:check" size="20" />
      </span>
      <span class="form-checkbox__label">{{ label }}</span>
    </label>
    <p v-if="help" :id="helpId" class="form-checkbox__help" aria-live="polite">{{ help }}</p>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.form-checkbox__box {
  display: flex;
  align-items: center;
  gap: 14px;
  min-height: tokens.$size-tap-target;
  cursor: pointer;
}

.form-checkbox__input {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
}

.form-checkbox__mark {
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

.form-checkbox__input:checked + .form-checkbox__mark {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
}

.form-checkbox__label {
  font-size: 15px;
  font-weight: 500;
  white-space: nowrap;
}

.form-checkbox--disabled {
  .form-checkbox__box {
    cursor: default;
  }

  .form-checkbox__mark {
    border-color: tokens.$color-checkbox-disabled-border;
    background: tokens.$color-checkbox-disabled-surface;
  }

  .form-checkbox__label {
    color: tokens.$color-text-meta;
  }
}

.form-checkbox__help {
  margin: 2px 0 0 38px;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
  line-height: 1.4;
  text-wrap: pretty;
}
</style>
