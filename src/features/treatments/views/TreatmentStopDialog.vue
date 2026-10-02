<script setup lang="ts">
import type { StopPrompt } from '../logic/treatment-stop'
import type { PromptActionId } from '../logic/treatment-unlogged'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'

defineProps<{
  prompt: StopPrompt
}>()

const emit = defineEmits<{
  /** Arrêter sans rien renseigner. */
  stop: []
  /** Renseigner les doses, puis arrêter. */
  act: [action: PromptActionId]
}>()

const open = defineModel<boolean>({ default: false })

function act(action: PromptActionId): void {
  open.value = false
  emit('act', action)
}
</script>

<template>
  <ConfirmDialog
    v-model="open"
    :title="prompt.title"
    :text="prompt.text"
    :note="prompt.todayNote"
    :cancel-label="prompt.cancel.text"
    :confirm-label="prompt.stopOnly.text"
    :cancel-aria-label="prompt.cancel.label"
    :confirm-aria-label="prompt.stopOnly.label"
    @confirm="emit('stop')"
  >
    <template v-if="prompt.actions.length > 0" #choices>
      <v-btn
        v-for="action in prompt.actions"
        :key="action.id"
        class="treatment-stop-dialog__choice"
        variant="outlined"
        color="primary"
        :aria-label="action.label"
        @click="act(action.id)"
      >
        {{ action.text }}
      </v-btn>
    </template>
  </ConfirmDialog>
</template>

<style lang="scss">
// Non scopé : le dialogue est téléporté hors du composant.
.treatment-stop-dialog__choice {
  border-width: 1.5px;
}
</style>
