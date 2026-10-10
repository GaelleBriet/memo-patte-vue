import {
  referenceReading,
  type ReferenceLine,
  type ReferenceSetting,
} from '@/shared/domain/dose-calendar/reference-model'
import { treatmentSchedule, type TreatmentPeriodInput } from '@/shared/domain/treatment-schedule'

import { plusDays, shifted, type Book } from './carnet'
import { dueKey, HORIZON_DAYS, type Display, type Reading } from './display'

/** Un moteur lu par l'oracle : le carnet entier en entrée, ce qu'il montre en sortie. */
export type Engine = { name: string; read(book: Book): Display }

// Assez d'échéances pour 4 heures par jour jusqu'à l'horizon, reports compris.
const UPCOMING_LIMIT = 4 * (HORIZON_DAYS + 1) + 50

export const currentEngine: Engine = {
  name: 'actuel',
  read({ periods, doses, today }) {
    const schedule = treatmentSchedule({ periods, doses, today })
    const until = plusDays(today, HORIZON_DAYS)
    const keys = (dues: { dueOn: string; dueTime: string | null }[]) => dues.map(dueKey).sort()
    return {
      phase: schedule.phase,
      finished: schedule.finished,
      current: keys(schedule.currentDoses),
      unlogged: keys(schedule.unloggedDoses),
      upcoming: keys(schedule.upcoming(UPCOMING_LIMIT).filter(({ dueOn }) => dueOn <= until)),
    }
  },
}

// Plan §3.1 (migration v12) : l'origine est `referenceOn` quand la grille qui en part passe par la
// première échéance (le 31 d'un mensuel), ou quand elle la suit (première échéance hors grille, G23) ;
// sinon la première échéance.
export function referenceSettings(periods: readonly TreatmentPeriodInput[]): ReferenceSetting[] {
  return periods.map(({ referenceOn, ...period }) => {
    let day = referenceOn
    for (let step = 1; day < period.firstDueOn; step += 1) {
      day = shifted(referenceOn, period.frequency, step)
    }
    const kept = day === period.firstDueOn || referenceOn > period.firstDueOn
    return { ...period, gridOriginOn: kept ? referenceOn : period.firstDueOn }
  })
}

export function referenceLines(doses: Book['doses']): ReferenceLine[] {
  return doses.map(({ id, periodId, dueOn, dueTime, status, nextDueDate, updatedAt }) => ({
    id,
    settingId: periodId,
    dueOn,
    dueTime,
    status,
    targetOn: status === 'postponed' || status === 'shift' ? nextDueDate : null,
    updatedAt,
  }))
}

export const referenceEngine: Engine = {
  name: 'reference',
  read({ periods, doses, today }) {
    return referenceReading({
      settings: referenceSettings(periods),
      lines: referenceLines(doses),
      today,
      until: plusDays(today, HORIZON_DAYS),
    })
  },
}

export const ENGINES: Record<string, Engine> = {
  actuel: currentEngine,
  reference: referenceEngine,
}

export function readWith(engine: Engine, book: Book): Reading {
  try {
    return engine.read(book)
  } catch (error) {
    return { error: String(error) }
  }
}
