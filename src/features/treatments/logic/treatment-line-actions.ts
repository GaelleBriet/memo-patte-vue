import type { DoseAction } from './treatment-dose-change'
import { moveText, type DoseLineAction } from './treatment-history'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { Due, MoveBounds, TreatmentView } from '@/shared/domain/dose-calendar'
import { formatLongDate } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

type Line = Pick<
  TreatmentDose,
  'id' | 'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'targetOn'
>

/** La dose que montre une ligne de report : à son jour d'arrivée. */
export function movedDueOf(line: Pick<Line, 'periodId' | 'dueOn' | 'dueTime' | 'targetOn'>): Due {
  return { settingId: line.periodId, dueOn: line.targetOn ?? line.dueOn, dueTime: line.dueTime }
}

/** Geste d'un choix du menu ⋮ ; `null` pour « Changer la date », qui attend le jour choisi. */
export function lineAction(line: Line, choice: DoseLineAction, today: string): DoseAction | null {
  const due = { settingId: line.periodId, dueOn: line.dueOn, dueTime: line.dueTime }
  switch (choice) {
    case 'remove':
    case 'remove-move':
    case 'remove-shift':
      return { kind: 'remove', lineId: line.id }
    case 'mark-missed':
      return {
        kind: 'note',
        gesture: {
          kind: 'note',
          due,
          status: 'missed',
          givenOn: line.dueOn,
          shiftsFollowing: false,
        },
      }
    case 'mark-given':
      return {
        kind: 'note',
        gesture: {
          kind: 'note',
          due,
          status: 'given',
          givenOn: line.dueOn > today ? today : line.dueOn,
          shiftsFollowing: false,
        },
      }
    case 'change-date':
      return null
  }
}

export type DateChange = {
  subtitle: string
  date: string
  min: string | null
  max: string | null
  /** Jours grisés : ceux où le moteur refuse déjà le déplacement. */
  excluded: string[]
  /** `shiftsFollowing` : la case « Décaler aussi les doses suivantes », cochée par défaut. */
  action(date: string, shiftsFollowing?: boolean): DoseAction
}

/** `null` : la ligne ne change pas de date (prise oubliée, report que le moteur ne déplace pas). */
export function dateChangeOf(
  t: Translate,
  line: Line,
  bounds: MoveBounds | null,
  {
    today,
    earliest,
    view,
  }: { today: string; earliest: string | null; view: Pick<TreatmentView, 'earliestGivenOn'> },
): DateChange | null {
  if (line.status === 'postponed') {
    if (bounds === null) return null
    return {
      subtitle: moveText(t, line),
      date: line.targetOn ?? line.dueOn,
      min: bounds.earliest,
      max: bounds.latest,
      excluded: bounds.excluded,
      action: (to, shiftsFollowing = true) => ({
        kind: 'move',
        due: movedDueOf(line),
        to,
        shiftsFollowing,
      }),
    }
  }
  if (line.givenOn === null) return null
  const date = formatLongDate(line.givenOn)
  // M1, TR-24 bis : une prise donnée ne descend pas un intervalle ou plus avant son échéance.
  const boundary =
    line.status === 'given'
      ? view.earliestGivenOn({ settingId: line.periodId, dueOn: line.dueOn, dueTime: line.dueTime })
      : null
  return {
    subtitle:
      line.status === 'extra'
        ? t('treatments.detail.changeDateSubtitleExtra', { date })
        : t('treatments.detail.changeDateSubtitle', { date }),
    date: line.givenOn,
    min:
      [earliest, boundary]
        .filter((day) => day !== null)
        .sort()
        .at(-1) ?? null,
    max: today,
    excluded: [],
    action: (givenOn, shiftsFollowing = true) => ({
      kind: 'redate',
      lineId: line.id,
      givenOn,
      shiftsFollowing,
    }),
  }
}
