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
    <FormSegmented
      v-model="answer"
      class="treatment-extra-question__choices"
      :options="question.options"
      :label-id="titleId"
    />
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

  // Sélecteurs doublés : ils doivent l'emporter sur les styles scopés de FormSegmented.
  .treatment-extra-question__choices.form-segmented {
    height: auto;
    min-height: tokens.$height-segmented;
  }

  .treatment-extra-question__choices .form-segmented__option {
    height: auto;
    padding-block: 8px;
    line-height: 1.25;
  }

  .treatment-extra-question__choices .v-btn__content {
    white-space: normal;
    text-align: center;
  }
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
