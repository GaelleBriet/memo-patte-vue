<script setup lang="ts">
import { useId } from 'vue'

import type { ExtraQuestion } from '../logic/treatment-card-other-date'
import FormSegmented from '@/shared/form/FormSegmented.vue'
import type { ExtraAnswer } from '@/shared/domain/dose-calendar'

defineProps<{ question: ExtraQuestion }>()

const answer = defineModel<ExtraAnswer | null>({ required: true })

const titleId = useId()
</script>

<template>
  <div class="treatment-extra-question">
    <p :id="titleId" class="treatment-extra-question__title">{{ question.title }}</p>
    <FormSegmented v-model="answer" :options="question.options" :label-id="titleId" />
    <p v-if="question.help" class="treatment-extra-question__help" aria-live="polite">
      {{ question.help }}
    </p>
  </div>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la question vit dans une feuille téléportée hors du composant.
.treatment-extra-question {
  margin-top: 12px;
}

.treatment-extra-question__title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
}

.treatment-extra-question__help {
  margin: 8px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.45;
}
</style>
