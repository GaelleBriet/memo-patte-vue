import { treatmentView, viewInputOf } from '@/shared/domain/dose-calendar'
import { referenceReading } from '@/shared/domain/dose-calendar/reference-model'
import { treatmentSchedule } from '@/shared/domain/treatment-schedule'

import { plusDays, type Book } from './carnet'
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

// Les deux lectures v2 reçoivent le carnet par le même adaptateur (plan §3.1).
export const referenceEngine: Engine = {
  name: 'reference',
  read(book) {
    const { settings, lines, today } = viewInputOf(book)
    return referenceReading({ settings, lines, today, until: plusDays(today, HORIZON_DAYS) })
  },
}

export const v2Engine: Engine = {
  name: 'v2',
  read(book) {
    const view = treatmentView(viewInputOf(book))
    const keys = (dues: { dueOn: string; dueTime: string | null }[]) => dues.map(dueKey).sort()
    return {
      phase: view.phase,
      finished: view.finished,
      current: keys(view.currentDoses),
      unlogged: keys(view.unloggedDoses),
      upcoming: keys(view.upcoming({ to: plusDays(book.today, HORIZON_DAYS) })),
    }
  },
}

export const ENGINES: Record<string, Engine> = {
  actuel: currentEngine,
  reference: referenceEngine,
  v2: v2Engine,
}

export function readWith(engine: Engine, book: Book): Reading {
  try {
    return engine.read(book)
  } catch (error) {
    return { error: String(error) }
  }
}
