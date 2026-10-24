<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TreatmentExtraQuestion from './TreatmentExtraQuestion.vue'
import TreatmentShiftCheckbox from './TreatmentShiftCheckbox.vue'
import type { ExtraRedateQuestion } from '../logic/treatment-extra-redate'
import type { DateChangeBox } from '../logic/treatment-shift-box'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import DateCalendar from '@/shared/components/DateCalendar.vue'
import type { ExtraAnswer } from '@/shared/domain/dose-calendar'

const props = withDefaults(
  defineProps<{
    subtitle: string | null
    /** Date actuelle, présélectionnée. */
    date: string | null
    min?: string | null
    max?: string | null
    excluded?: readonly string[]
    hint?: string | null
    /** `null` : pas de case pour cette ligne. */
    box?: DateChangeBox | null
    /** « Cette prise » d'une prise en plus ; `null` : jamais posée. */
    question?: ExtraRedateQuestion | null
    busy?: boolean
  }>(),
  { min: null, max: null, excluded: () => [], hint: null, box: null, question: null, busy: false },
)

const emit = defineEmits<{
  save: [date: string, shiftsFollowing: boolean, answer?: ExtraAnswer]
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()

const chosen = ref<string | null>(props.date)
const shifts = ref(true)
const answer = ref<ExtraAnswer | null>(null)

const asked = computed(() => props.question?.(chosen.value, answer.value, shifts.value) ?? null)
const view = computed(
  () =>
    props.box?.view(chosen.value, shifts.value, asked.value === null ? null : answer.value) ?? null,
)
const refused = computed(() => [...props.excluded, ...(props.box?.refusedDays(shifts.value) ?? [])])
const canSave = computed(
  () =>
    chosen.value !== null &&
    chosen.value !== props.date &&
    view.value?.blocked !== true &&
    (asked.value === null || answer.value !== null),
)

watch(open, (isOpen) => {
  if (!isOpen) return
  chosen.value = props.date
  shifts.value = props.box?.initial ?? true
  answer.value = null
})
watch(chosen, () => {
  answer.value = null
})

function save(): void {
  if (chosen.value === null) return
  const shiftsFollowing = view.value?.shown === true ? shifts.value : true
  if (asked.value === null || answer.value === null) emit('save', chosen.value, shiftsFollowing)
  else emit('save', chosen.value, shiftsFollowing, answer.value)
  open.value = false
}
</script>

<template>
  <BottomSheet
    v-model="open"
    class="treatment-change-date"
    :title="t('history.changeDate')"
    :subtitle="subtitle"
    :close-label="t('reminderSheet.close')"
    icon="ms:edit_calendar"
    :persistent="busy"
  >
    <DateCalendar
      v-model="chosen"
      class="treatment-change-date__calendar"
      :min="min"
      :max="max"
      :excluded="refused"
    />
    <p v-if="hint" class="treatment-change-date__hint">{{ hint }}</p>
    <TreatmentExtraQuestion v-if="asked" v-model="answer" :question="asked" />
    <TreatmentShiftCheckbox
      v-if="view?.shown"
      v-model="shifts"
      class="treatment-change-date__shift"
      :help="view.help"
    />
    <p v-else-if="view?.help" class="treatment-change-date__refused" role="status">
      {{ view.help.text }}
    </p>
    <v-btn
      class="treatment-change-date__save"
      variant="flat"
      color="primary"
      :disabled="busy || !canSave"
      @click="save"
    >
      {{ t('treatments.shift.save') }}
    </v-btn>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la feuille est téléportée hors du composant.
.treatment-change-date__calendar {
  margin-top: 12px;
}

.treatment-change-date__hint {
  margin: 8px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.45;
}

.treatment-change-date__shift {
  margin-top: 12px;
}

.treatment-change-date__refused {
  margin: 12px 0 0;
  padding: 10px 14px;
  border: 1px solid tokens.$color-shift-warning-border;
  border-radius: 12px;
  background: tokens.$color-shift-warning-surface;
  color: tokens.$color-shift-warning-text;
  font-size: 14px;
  line-height: 1.45;
}

.treatment-change-date__save {
  width: 100%;
  height: 52px;
  margin-top: 14px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
</style>
