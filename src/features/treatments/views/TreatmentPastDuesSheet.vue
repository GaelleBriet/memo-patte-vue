<script setup lang="ts">
import type { PastDuesTexts } from '../logic/treatment-past-dues'
import type { PastDuesChoice } from '../schema/treatment-form.schema'
import BottomSheet from '@/shared/components/BottomSheet.vue'

defineProps<{
  texts: PastDuesTexts
}>()

const emit = defineEmits<{
  choose: [choice: PastDuesChoice]
}>()

const open = defineModel<boolean>({ default: false })

function choose(choice: PastDuesChoice): void {
  open.value = false
  emit('choose', choice)
}
</script>

<template>
  <BottomSheet
    v-model="open"
    class="treatment-past-dues"
    icon="ms:event_repeat"
    :title="texts.title"
    :subtitle="texts.text"
    :close-label="texts.cancel"
  >
    <div class="treatment-past-dues__card">
      <button
        type="button"
        class="treatment-past-dues__choice treatment-past-dues__choice--keep"
        @click="choose('keep')"
      >
        <span class="treatment-past-dues__label">{{ texts.keep }}</span>
        <span class="treatment-past-dues__hint">{{ texts.keepHint }}</span>
      </button>
      <button
        type="button"
        class="treatment-past-dues__choice treatment-past-dues__choice--drop"
        @click="choose('drop')"
      >
        <span class="treatment-past-dues__label">{{ texts.drop }}</span>
        <span class="treatment-past-dues__hint">{{ texts.dropHint }}</span>
      </button>
    </div>
    <v-btn
      class="treatment-past-dues__cancel"
      variant="text"
      color="primary"
      block
      @click="open = false"
    >
      {{ texts.cancel }}
    </v-btn>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la feuille est téléportée hors du composant.
.treatment-past-dues__card {
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-tile;
  background: rgb(var(--v-theme-surface));
}

.treatment-past-dues__choice {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  min-height: 64px;
  padding: 12px 18px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: start;
  cursor: pointer;
}

.treatment-past-dues__choice + .treatment-past-dues__choice {
  border-top: 1px solid tokens.$color-divider;
}

.treatment-past-dues__label {
  color: rgb(var(--v-theme-primary));
  font-size: 15.5px;
  font-weight: 700;
}

.treatment-past-dues__hint {
  color: tokens.$color-text-secondary;
  font-size: 13px;
  line-height: 1.4;
}

.treatment-past-dues__cancel {
  height: tokens.$size-tap-target;
  margin-top: 10px;
  border-radius: tokens.$radius-pill;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
</style>
