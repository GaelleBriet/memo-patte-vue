import type { Ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { alreadyNotedText } from '../logic/treatment-gestures'
import { sheetDoneTarget } from '../logic/treatment-sheet'
import {
  originQuery,
  REMINDER_QUERY_PARAM,
  todoReminderValue,
  type NotifiedDue,
  type TodoDue,
} from '@/shared/domain/reminder-route'
import type { NoteGesture } from '../logic/treatment-dose-change'
import type { Due } from '@/shared/domain/dose-calendar'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'
import { formatDayMonthOrYear, withoutFinalDot } from '@/shared/utils/format'
import { showToast } from '@/shared/utils/toast'

type SheetState = {
  treatmentId: Ref<string | null>
  reading: Ref<TreatmentReading | null>
  doseDue: Ref<NotifiedDue | null>
  today: Ref<string>
  named: Ref<{ name: string; animal: string }>
}

type SheetHandlers = {
  note: (gesture: NoteGesture, heldBy?: string) => void
  confirm: (due: Due) => void
  close: () => void
  changed: () => void
}

/** « Fait aujourd'hui » et « Modifier » de la feuille « À faire », sur l'échéance de sa ligne. */
export function useTreatmentSheetActions(
  { treatmentId, reading, doseDue, today, named }: SheetState,
  { note, confirm, close, changed }: SheetHandlers,
) {
  const { t } = useI18n()
  const router = useRouter()
  const route = useRoute()

  function info(message: string): void {
    close()
    showToast(message, { tone: 'info' })
  }

  function openDetail(dueOn: string): void {
    if (treatmentId.value === null) return
    const date = withoutFinalDot(formatDayMonthOrYear(dueOn, today.value))
    info(t('treatments.sheet.toast.extraOnDetail', { animal: named.value.animal, date }))
    void router.push({
      name: 'treatment-detail',
      params: { id: treatmentId.value },
      query: originQuery(route),
    })
  }

  function doneToday(): void {
    if (reading.value === null) return
    if (doseDue.value === null) {
      info(t('treatments.sheet.errors.noDoseLeft'))
      return
    }
    const target = sheetDoneTarget(reading.value, doseDue.value, today.value)
    switch (target.kind) {
      case 'note':
        note(target.gesture, target.heldBy)
        return
      case 'confirm':
        confirm(target.due)
        return
      case 'already':
        info(alreadyNotedText(t, { ...named.value, today: today.value }, target.givenOn))
        return
      case 'missed':
        info(t('treatments.sheet.toast.alreadyMissed'))
        return
      case 'detail':
        openDetail(target.dueOn)
        return
      case 'none':
        close()
        changed()
    }
  }

  // L'accueil garde le rappel et son échéance dans son adresse : le retour, bouton Android compris, rouvre la feuille.
  async function edit(treatmentId: string, due: TodoDue | null): Promise<void> {
    const reminder = todoReminderValue({ kind: 'treatment', id: treatmentId, due })
    close()
    await router.replace({ query: { ...route.query, [REMINDER_QUERY_PARAM]: reminder } })
    await router.push({
      name: 'treatment-edit',
      params: { id: treatmentId },
      query: { from: String(route.name ?? ''), [REMINDER_QUERY_PARAM]: reminder },
    })
  }

  return { doneToday, edit }
}
