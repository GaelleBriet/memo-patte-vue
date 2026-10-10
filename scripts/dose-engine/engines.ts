import { treatmentView, viewInputOf } from '@/shared/domain/dose-calendar'
import { referenceReading } from '@/shared/domain/dose-calendar/reference-model'
import { treatmentSchedule } from '@/shared/domain/treatment-schedule'

import { daysBetween, plusDays, type Book } from './carnet'
import { dueKey, HORIZON_DAYS, type Display, type Reading } from './display'

/**
 * Un moteur lu par l'oracle : le carnet entier en entrée, ce qu'il montre en sortie, les échéances à
 * venir jusqu'à `until` (l'horizon par défaut).
 */
export type Engine = { name: string; read(book: Book, until?: string): Display }

const horizonOf = (book: Book) => plusDays(book.today, HORIZON_DAYS)

export const currentEngine: Engine = {
  name: 'actuel',
  read(book, until = horizonOf(book)) {
    const { periods, doses, today } = book
    const schedule = treatmentSchedule({ periods, doses, today })
    // Assez d'échéances pour 4 heures par jour jusqu'à `until`, reports compris.
    const limit = 4 * (daysBetween(today, until) + 1) + 50
    const keys = (dues: { dueOn: string; dueTime: string | null }[]) => dues.map(dueKey).sort()
    return {
      phase: schedule.phase,
      finished: schedule.finished,
      current: keys(schedule.currentDoses),
      unlogged: keys(schedule.unloggedDoses),
      upcoming: keys(schedule.upcoming(limit).filter(({ dueOn }) => dueOn <= until)),
    }
  },
}

// Les deux lectures v2 reçoivent le carnet par le même adaptateur (plan §3.1).
export const referenceEngine: Engine = {
  name: 'reference',
  read(book, until = horizonOf(book)) {
    const { settings, lines, today } = viewInputOf(book)
    return referenceReading({ settings, lines, today, until })
  },
}

export const v2Engine: Engine = {
  name: 'v2',
  read(book, until = horizonOf(book)) {
    const view = treatmentView(viewInputOf(book))
    const keys = (dues: { dueOn: string; dueTime: string | null }[]) => dues.map(dueKey).sort()
    return {
      phase: view.phase,
      finished: view.finished,
      current: keys(view.currentDoses),
      unlogged: keys(view.unloggedDoses),
      upcoming: keys(view.upcoming({ to: until })),
    }
  },
}

export const ENGINES: Record<string, Engine> = {
  actuel: currentEngine,
  reference: referenceEngine,
  v2: v2Engine,
}

export function readWith(engine: Engine, book: Book, until?: string): Reading {
  try {
    return engine.read(book, until)
  } catch (error) {
    return { error: String(error) }
  }
}
