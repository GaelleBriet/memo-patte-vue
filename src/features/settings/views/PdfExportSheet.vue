<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChoiceCards, { type ChoiceCard } from './ChoiceCards.vue'
import { usePdfExport } from '../composables/use-pdf-export'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import { showToast } from '@/shared/utils/toast'

export type PdfExportAnimal = {
  id: string
  name: string
  species: 'dog' | 'cat'
}

const props = defineProps<{
  animals: PdfExportAnimal[]
  focusFallback?: HTMLElement | null
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const { isPreparing, hasFailed, run, reset } = usePdfExport()

const needsPicker = computed(() => props.animals.length > 1)
const selected = ref<string | null>(props.animals[0]?.id ?? null)
const groupLabelId = useId()

const choices = computed<ChoiceCard<string>[]>(() =>
  props.animals.map((animal) => ({
    value: animal.id,
    icon: 'ms:pets',
    label: animal.name,
    description: t(`animals.form.species.${animal.species}`),
  })),
)

const subtitle = computed(() => {
  if (needsPicker.value) return t('settings.pdf.sheet.subtitlePick')
  const [animal] = props.animals
  return animal ? t('settings.pdf.sheet.subtitleOne', { name: animal.name }) : ''
})

watch(open, (isOpen) => {
  if (!isOpen) return
  selected.value = props.animals[0]?.id ?? null
  reset()
})

async function submit(): Promise<void> {
  if (selected.value === null) return
  const outcome = await run(selected.value)
  if (outcome !== 'shared') return
  open.value = false
  showToast(t('settings.pdf.success'))
}
</script>

<template>
  <BottomSheet
    v-model="open"
    class="pdf-export-sheet"
    :title="t('settings.pdf.sheet.title')"
    :subtitle="subtitle"
    :close-label="t('settings.pdf.sheet.close')"
    :persistent="isPreparing"
    :focus-fallback="focusFallback"
  >
    <template v-if="needsPicker">
      <p :id="groupLabelId" class="pdf-export-sheet__group-label" aria-hidden="true">
        {{ t('settings.pdf.sheet.pickAnimalLabel') }}
      </p>
      <ChoiceCards
        v-model="selected"
        :choices="choices"
        :labelledby="groupLabelId"
        :disabled="isPreparing"
      />
    </template>

    <p v-if="hasFailed" class="pdf-export-sheet__error" role="alert">
      {{ t('settings.pdf.sheet.error') }}
    </p>

    <v-btn
      class="pdf-export-sheet__submit"
      variant="flat"
      color="primary"
      :disabled="isPreparing || selected === null"
      @click="submit"
    >
      <v-progress-circular
        v-if="isPreparing"
        class="pdf-export-sheet__spinner"
        indeterminate
        :size="18"
        :width="2"
      />
      {{ isPreparing ? t('settings.pdf.sheet.preparing') : t('settings.pdf.sheet.submit') }}
    </v-btn>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

.pdf-export-sheet__group-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.pdf-export-sheet__spinner {
  margin-inline-end: 8px;
}

.pdf-export-sheet__error {
  margin: 12px 0 0;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}

.pdf-export-sheet__submit {
  width: 100%;
  height: 52px;
  margin-top: 22px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.pdf-export-sheet__submit:disabled,
.pdf-export-sheet__submit.v-btn--disabled {
  background: tokens.$color-disabled-surface;
  color: tokens.$color-disabled-text;
}
</style>
