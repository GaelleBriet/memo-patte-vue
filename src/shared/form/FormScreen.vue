<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'

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
const isScrolled = ref(false)

function onScroll(event: Event): void {
  isScrolled.value = (event.target as HTMLElement).scrollTop > 2
}
</script>

<template>
  <div class="form-screen">
    <div class="form-screen__scroll" @scroll="onScroll">
      <header class="form-screen__topbar" :class="{ 'form-screen__topbar--scrolled': isScrolled }">
        <v-btn
          class="form-screen__back"
          icon="ms:arrow_back"
          variant="text"
          color="primary"
          :aria-label="t('form.back')"
          @click="emit('cancel')"
        />
        <div
          class="form-screen__heading"
          :class="{ 'form-screen__heading--with-subtitle': Boolean(subtitle) }"
        >
          <h1 class="form-screen__title">{{ title }}</h1>
          <p v-if="subtitle" class="form-screen__subtitle">{{ subtitle }}</p>
        </div>
      </header>

      <div class="form-screen__fields">
        <slot />
      </div>
    </div>

    <footer class="form-screen__actions">
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
    </footer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.form-screen {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: rgb(var(--v-theme-background));
}

.form-screen__scroll {
  flex: 1 1 auto;
  overflow-y: auto;
}

.form-screen__topbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: rgb(var(--v-theme-background));
  border-bottom: 1px solid transparent;
}

.form-screen__topbar--scrolled {
  border-bottom-color: tokens.$color-actions-border;
  box-shadow: 0 1px 3px rgb(30 25 20 / 6%);
}

.form-screen__back {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
}

.form-screen__heading {
  min-width: 0;
}

.form-screen__title {
  overflow: hidden;
  font-family: tokens.$font-family-heading;
  font-size: 22px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.form-screen__heading--with-subtitle .form-screen__title {
  line-height: 1.2;
}

.form-screen__subtitle {
  overflow: hidden;
  color: tokens.$color-hint;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.form-screen__fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 12px 20px 24px;
}

.form-screen__actions {
  flex: 0 0 auto;
  padding: 12px 20px 30px;
  background: tokens.$color-actions-surface;
  border-top: 1px solid tokens.$color-actions-border;
}

.form-screen__buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.form-screen__cancel {
  flex: 0 0 auto;
  letter-spacing: normal;
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
