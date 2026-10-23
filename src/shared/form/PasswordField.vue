<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import FormField from './FormField.vue'

defineProps<{
  label: string
  controlId: string
  autocomplete: 'current-password' | 'new-password'
  required?: boolean
  error?: string | null
  help?: string | null
  autofocus?: boolean
}>()
const emit = defineEmits<{ blur: [] }>()
const model = defineModel<string>({ required: true })

const { t } = useI18n()

const isVisible = ref(false)

const toggleLabel = computed(() =>
  isVisible.value ? t('form.password.hide') : t('form.password.show'),
)

function toggle(): void {
  isVisible.value = !isVisible.value
}
</script>

<template>
  <FormField
    :label="label"
    :control-id="controlId"
    :required="required"
    :error="error"
    :help="help"
  >
    <template #default="{ describedby, invalid }">
      <v-text-field
        :id="controlId"
        v-model="model"
        class="form-field__input"
        :type="isVisible ? 'text' : 'password'"
        :autocomplete="autocomplete"
        autocapitalize="none"
        autocorrect="off"
        spellcheck="false"
        variant="outlined"
        hide-details
        :autofocus="autofocus"
        :aria-required="required ? 'true' : undefined"
        :aria-describedby="describedby"
        :aria-invalid="invalid"
        :error="invalid"
        @blur="emit('blur')"
      >
        <template #append-inner>
          <button
            type="button"
            class="password-field__toggle"
            :aria-label="toggleLabel"
            @click="toggle"
          >
            <v-icon :icon="isVisible ? 'ms:visibility_off' : 'ms:visibility'" />
          </button>
        </template>
      </v-text-field>
    </template>
  </FormField>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.password-field__toggle {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: tokens.$size-tap-target;
  height: tokens.$size-tap-target;
  margin-inline-end: -12px;
  border: 0;
  border-radius: tokens.$radius-pill;
  background: transparent;
  color: tokens.$color-text-secondary;
}

.password-field__toggle .v-icon {
  font-size: 22px;
}
</style>
