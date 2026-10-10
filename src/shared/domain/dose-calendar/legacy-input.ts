import { stepped } from './grid'
import type { Day, Line, LineStatus, Setting, TreatmentViewInput } from './types'

/** Réglage tel que le schéma v11 l'enregistre : `referenceOn` porte encore plusieurs sens. */
export type LegacyPeriod = Omit<Setting, 'gridOriginOn'> & { referenceOn: Day }

/** Ligne telle que le schéma v11 l'enregistre : `nextDueDate`, relu seulement pour un report ou un décalage. */
export type LegacyDose = Omit<Line, 'settingId' | 'targetOn'> & {
  periodId: string
  status: LineStatus
  nextDueDate: Day
}

export type LegacyInput = {
  periods: readonly LegacyPeriod[]
  doses: readonly LegacyDose[]
  today: Day
}

/**
 * Plan §3.1 : l'origine est `referenceOn` quand la grille qui en part passe par la première
 * échéance (le 31 d'un mensuel) ou la suit, sinon la première échéance.
 */
function settingOf({ referenceOn, ...period }: LegacyPeriod): Setting {
  let day = referenceOn
  for (let step = 1; day < period.firstDueOn; step += 1) {
    day = stepped(referenceOn, period.frequency, step)
  }
  const kept = day === period.firstDueOn || referenceOn > period.firstDueOn
  return { ...period, gridOriginOn: kept ? referenceOn : period.firstDueOn }
}

function lineOf({ periodId, nextDueDate, ...dose }: LegacyDose): Line {
  const moves = dose.status === 'postponed' || dose.status === 'shift'
  return {
    id: dose.id,
    settingId: periodId,
    dueOn: dose.dueOn,
    dueTime: dose.dueTime,
    status: dose.status,
    givenOn: dose.givenOn,
    targetOn: moves ? nextDueDate : null,
    updatedAt: dose.updatedAt,
  }
}

/** Les anciens types d'entrée, convertis en mémoire jusqu'au schéma v12. */
export function viewInputOf({ periods, doses, today }: LegacyInput): TreatmentViewInput {
  const ordered = [...periods].sort(
    (a, b) =>
      a.startsOn.localeCompare(b.startsOn) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  )
  const inherits = (period: LegacyPeriod) => {
    const previous = ordered[ordered.indexOf(period) - 1]
    return (
      previous !== undefined &&
      previous.stoppedOn === null &&
      previous.frequency.value === period.frequency.value &&
      previous.frequency.unit === period.frequency.unit
    )
  }
  return {
    settings: periods.map((period) =>
      inherits(period) ? { ...settingOf(period), gridOriginOn: null } : settingOf(period),
    ),
    lines: doses.map(lineOf),
    today,
  }
}
