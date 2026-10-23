<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import { CODE_LENGTH } from '../logic/email-code'

const props = withDefaults(
  defineProps<{
    email: string
    code: string
    errorKey: string | null
    noticeKey: string | null
    isExpired: boolean
    isResending: boolean
    message?: string | null
    label?: string | null
    inputLabel?: string | null
    canChangeAddress?: boolean
    canResend?: boolean
  }>(),
  { message: null, label: null, inputLabel: null, canChangeAddress: true, canResend: true },
)

const emit = defineEmits<{
  'update:code': [input: string]
  resend: []
  changeAddress: []
}>()

const { t } = useI18n()

const messageId = useId()
const errorId = useId()
const isFocused = ref(false)
const input = useTemplateRef<HTMLInputElement>('input')

const digits = computed(() =>
  Array.from({ length: CODE_LENGTH }, (_, index) => props.code[index] ?? ''),
)

async function onInput(event: Event): Promise<void> {
  emit('update:code', (event.target as HTMLInputElement).value)
  await nextTick()
  if (input.value) input.value.value = props.code
}
</script>

<template>
  <div class="email-code">
    <p :id="messageId" class="email-code__message">
      {{ message ?? t('auth.code.message', { email, length: CODE_LENGTH }) }}
    </p>

    <p v-if="label" class="email-code__label" aria-hidden="true">{{ label }}</p>
    <div class="email-code__field">
      <input
        id="email-code-input"
        ref="input"
        class="email-code__input"
        :value="code"
        type="text"
        inputmode="numeric"
        autocomplete="one-time-code"
        :aria-label="inputLabel ?? undefined"
        :aria-labelledby="inputLabel ? undefined : messageId"
        :aria-describedby="errorKey ? errorId : undefined"
        :aria-invalid="errorKey ? 'true' : 'false'"
        @input="onInput"
        @focus="isFocused = true"
        @blur="isFocused = false"
      />
      <div class="email-code__boxes" :style="{ '--code-length': CODE_LENGTH }" aria-hidden="true">
        <span
          v-for="(digit, index) in digits"
          :key="index"
          class="email-code__box"
          :class="{
            'email-code__box--invalid': errorKey,
            'email-code__box--current': !errorKey && isFocused && index === code.length,
          }"
          >{{ digit }}</span
        >
      </div>
    </div>

    <p v-if="errorKey" :id="errorId" class="email-code__error" role="alert">
      <v-icon icon="ms:error_fill" size="16" />
      <span>{{ t(errorKey) }}</span>
    </p>

    <slot />

    <div class="email-code__links">
      <v-btn
        class="email-code__resend"
        :variant="isExpired ? 'outlined' : 'text'"
        color="primary"
        :loading="isResending"
        :disabled="!canResend"
        @click="emit('resend')"
      >
        {{ t('auth.code.resend') }}
      </v-btn>
      <p v-if="noticeKey" class="email-code__notice" role="status">{{ t(noticeKey) }}</p>
      <v-btn
        v-if="canChangeAddress"
        class="email-code__change"
        variant="text"
        color="primary"
        @click="emit('changeAddress')"
      >
        {{ t('auth.code.changeAddress') }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.email-code {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 4px 20px 32px;
}

.email-code__message {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.email-code__label {
  margin: 0 0 -8px;
  color: tokens.$color-field-label;
  font-size: 12.5px;
  font-weight: 600;
}

.email-code__field {
  position: relative;
}

.email-code__input {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  border: 0;
  background: transparent;
  color: transparent;
  caret-color: transparent;
  font-size: 16px;
  outline: none;
}

.email-code__boxes {
  display: grid;
  grid-template-columns: repeat(var(--code-length), 1fr);
  gap: 8px;
}

.email-code__box {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 60px;
  border: 1px solid tokens.$color-field-border;
  border-radius: 12px;
  background: tokens.$color-field-surface;
  color: rgb(var(--v-theme-primary));
  font-size: 24px;
  font-weight: 700;
}

.email-code__box--current {
  border: 2px solid rgb(var(--v-theme-primary));
}

.email-code__box--invalid {
  border: 2px solid rgb(var(--v-theme-error));
}

.email-code__error {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.4;

  .v-icon {
    flex: 0 0 auto;
    margin-top: 1px;
  }
}

.email-code__links {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

.email-code__resend,
.email-code__change {
  height: 50px;
  border-radius: tokens.$radius-pill;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;

  @include tap.tap-target;
}

.email-code__notice {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
  line-height: 1.4;
  text-align: center;
}
</style>
