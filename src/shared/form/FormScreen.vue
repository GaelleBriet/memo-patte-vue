<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import PushedScreen from '@/shared/PushedScreen.vue'

defineProps<{
  title: string
  subtitle?: string | null
  submitLabel: string
  isSubmitting?: boolean
  disabled?: boolean
  errorMessage?: string | null
}>()

const emit = defineEmits<{
  cancel: []
  submit: []
}>()

const { t } = useI18n()
</script>

<template>
  <PushedScreen
    class="form-screen"
    :title="title"
    :subtitle="subtitle"
    :back-label="t('form.back')"
    @back="emit('cancel')"
  >
    <div class="form-screen__fields">
      <slot />
    </div>

    <template #actions>
      <div class="form-screen__actions">
        <p v-if="errorMessage" class="form-screen__save-error" role="alert">
          {{ errorMessage }}
        </p>
        <div class="form-screen__buttons">
          <v-btn
            class="form-screen__cancel"
            variant="text"
            color="primary"
            :disabled="isSubmitting"
            @click="emit('cancel')"
          >
            {{ t('form.cancel') }}
          </v-btn>
          <v-btn
            class="form-screen__submit"
            variant="flat"
            color="primary"
            :disabled="isSubmitting || disabled"
            @click="emit('submit')"
          >
            <v-progress-circular
              v-if="isSubmitting"
              class="form-screen__spinner"
              indeterminate
              :size="18"
              :width="2"
            />
            {{ submitLabel }}
          </v-btn>
        </div>
      </div>
    </template>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.form-screen__fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 12px 20px 24px;
}

.form-screen__actions {
  padding: 12px 20px 30px;
}

.form-screen__buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-screen__cancel {
  flex: 0 0 auto;
  letter-spacing: normal;

  @include tap.tap-target;
}

.form-screen__submit {
  flex: 1 1 auto;
  gap: 8px;
  height: 52px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.form-screen__submit:disabled,
.form-screen__submit.v-btn--disabled {
  background: tokens.$color-disabled-surface;
  color: tokens.$color-disabled-text;
}

.form-screen__save-error {
  margin-bottom: 10px;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}
</style>
