<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { pastInjectionError, pastInjectionTexts } from '../logic/vaccination-history'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import FormField from '@/shared/form/FormField.vue'

const props = defineProps<{
  name: string
  animal: string
  today: string
  /** Jours qui ont déjà leur injection. */
  taken: readonly string[]
  busy: boolean
}>()

const emit = defineEmits<{
  add: [injectedOn: string]
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()

const injectedOn = ref('')

const texts = computed(() => pastInjectionTexts(t, { name: props.name, animal: props.animal }))
const error = computed(() =>
  injectedOn.value === ''
    ? null
    : pastInjectionError(injectedOn.value, { today: props.today, taken: props.taken }),
)

watch(open, (isOpen) => {
  if (isOpen) injectedOn.value = ''
})

function add(): void {
  if (injectedOn.value === '' || error.value !== null || props.busy) return
  emit('add', injectedOn.value)
}
</script>

<template>
  <BottomSheet
    v-model="open"
    class="past-injection-sheet"
    :title="texts.header"
    :subtitle="texts.eyebrow"
    :close-label="t('reminderSheet.close')"
    icon="ms:vaccines"
    :persistent="busy"
  >
    <h3 class="past-injection-sheet__title">{{ texts.title }}</h3>

    <FormField
      class="past-injection-sheet__field"
      :label="texts.dateLabel"
      control-id="past-injection-date"
      required
      :error="error ? texts[error] : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="past-injection-date"
          v-model="injectedOn"
          class="form-field__input form-field__input--date"
          type="date"
          :max="today"
          variant="outlined"
          hide-details
          aria-required="true"
          append-inner-icon="ms:calendar_month"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          :error="invalid"
        />
      </template>
    </FormField>

    <v-btn
      class="past-injection-sheet__submit"
      variant="flat"
      color="primary"
      :disabled="injectedOn === '' || error !== null || busy"
      @click="add"
    >
      <v-progress-circular v-if="busy" indeterminate :size="18" :width="2" />
      {{ texts.submit }}
    </v-btn>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la feuille est téléportée hors du composant.
.past-injection-sheet__title {
  margin: 20px 0 0;
  font-family: tokens.$font-family-heading;
  font-size: 19px;
  font-weight: 700;
}

.past-injection-sheet__field {
  margin-top: 16px;
}

.past-injection-sheet__submit {
  width: 100%;
  gap: 8px;
  height: 52px;
  margin-top: 20px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.past-injection-sheet__submit:disabled,
.past-injection-sheet__submit.v-btn--disabled {
  background: tokens.$color-disabled-surface;
  color: tokens.$color-disabled-text;
}
</style>
