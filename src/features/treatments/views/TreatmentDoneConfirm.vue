<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TreatmentShiftCheckbox from './TreatmentShiftCheckbox.vue'
import { hasSeveralTimes } from '../logic/treatment-gestures'
import { otherDateBox, otherDateNote, otherDateRecap } from '../logic/treatment-shift-box'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import type { Due, DoseGesture, TreatmentSchedule } from '@/shared/domain/treatment-schedule'

const props = withDefaults(
  defineProps<{
    name: string
    animal: string
    icon: string
    history: TreatmentWithHistory
    schedule: TreatmentSchedule
    today: string
    /** L'échéance que « C'est fait » note aujourd'hui. */
    due: Due | null
    busy?: boolean
  }>(),
  { busy: false },
)

const emit = defineEmits<{
  note: [gesture: DoseGesture]
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()

const shifts = ref(true)

const recap = computed(() =>
  otherDateRecap(
    t,
    props.due,
    props.today,
    props.due !== null && hasSeveralTimes(props.history, props.due.periodId),
  ),
)
const box = computed(() =>
  otherDateBox(
    t,
    props.due,
    props.today,
    { history: props.history, schedule: props.schedule, today: props.today },
    shifts.value,
  ),
)
const gesture = computed(() => otherDateNote(props.due, props.today, box.value, shifts.value))

watch(open, (isOpen) => {
  if (isOpen) shifts.value = true
})

function save(): void {
  if (gesture.value !== null) emit('note', gesture.value)
}
</script>

<template>
  <BottomSheet
    v-model="open"
    class="treatment-done-confirm"
    :title="t('history.done')"
    :subtitle="t('treatments.sheet.otherDay.subtitle', { name, animal })"
    :close-label="t('reminderSheet.close')"
    :icon="icon"
    :persistent="busy"
  >
    <p v-if="recap" class="treatment-done-confirm__recap">
      <v-icon icon="ms:event_available" size="22" />
      <span>{{ recap }}</span>
    </p>
    <TreatmentShiftCheckbox
      v-if="box.shown"
      v-model="shifts"
      class="treatment-done-confirm__shift"
      :help="box.help"
    />

    <div class="treatment-done-confirm__actions">
      <v-btn
        class="treatment-done-confirm__save"
        variant="flat"
        color="primary"
        :disabled="busy || gesture === null"
        @click="save"
      >
        {{ t('treatments.shift.save') }}
      </v-btn>
      <v-btn
        class="treatment-done-confirm__cancel"
        variant="text"
        color="primary"
        :disabled="busy"
        @click="open = false"
      >
        {{ t('form.cancel') }}
      </v-btn>
    </div>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

// Non scopé : la feuille est téléportée hors du composant.
.treatment-done-confirm__recap {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin: 12px 0 0;
  padding: 12px 16px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-tile;
  background: rgb(var(--v-theme-surface));
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.treatment-done-confirm__shift {
  margin-top: 12px;
}

.treatment-done-confirm__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 14px;

  .v-btn {
    width: 100%;
    border-radius: tokens.$radius-pill;
    font-size: 16px;
    font-weight: 700;
    letter-spacing: normal;
    text-transform: none;

    @include tap.tap-target;
  }
}

.treatment-done-confirm__save {
  height: 52px;
}
</style>
