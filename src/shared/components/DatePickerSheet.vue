<script setup lang="ts">
import BottomSheet from './BottomSheet.vue'
import DateCalendar from './DateCalendar.vue'

const props = withDefaults(
  defineProps<{
    title: string
    closeLabel: string
    subtitle?: string | null
    /** Date actuelle, présélectionnée. */
    date: string | null
    min?: string | null
    max?: string | null
    excluded?: readonly string[]
  }>(),
  { subtitle: null, min: null, max: null, excluded: () => [] },
)

const emit = defineEmits<{
  /** Un autre jour a été touché ; la feuille se ferme. */
  pick: [date: string]
}>()

const open = defineModel<boolean>({ default: false })

function pick(date: string | null): void {
  if (date === null || date === props.date) return
  emit('pick', date)
  open.value = false
}
</script>

<template>
  <BottomSheet
    v-model="open"
    class="date-picker-sheet"
    :title="title"
    :subtitle="subtitle"
    :close-label="closeLabel"
    icon="ms:edit_calendar"
  >
    <DateCalendar
      class="date-picker-sheet__calendar"
      :model-value="date"
      :min="min"
      :max="max"
      :excluded="excluded"
      @update:model-value="pick"
    />
  </BottomSheet>
</template>

<style lang="scss">
// Non scopé : la feuille est téléportée hors du composant.
.date-picker-sheet__calendar {
  margin-top: 12px;
}
</style>
