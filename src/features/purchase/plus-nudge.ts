import { differenceInCalendarDays, parseISO } from 'date-fns'
import { z } from 'zod'

import { readPlusNudgeSignals, type PlusNudgeSignals } from '@/shared/plus-nudge-signals'

export const PLUS_NUDGE_STORAGE_KEY = 'memopatte.plus.nudge'

export const PLUS_NUDGE_SPACING_DAYS = 30

export const PLUS_NUDGE_ENTRIES = 10

export const PLUS_NUDGE_TRIGGERS = ['firstPhoto', 'carnetValue', 'firstExport'] as const

export type PlusNudgeTrigger = (typeof PLUS_NUDGE_TRIGGERS)[number]

export type PlusNudgeState = {
  shown: PlusNudgeTrigger[]
  lastShownAt: string | null
  stopped: boolean
}

const NO_PLUS_NUDGE: PlusNudgeState = { shown: [], lastShownAt: null, stopped: false }

const stateSchema = z.object({
  shown: z.array(z.enum(PLUS_NUDGE_TRIGGERS)).optional(),
  lastShownAt: z.iso.datetime({ offset: true }).nullable().optional(),
  stopped: z.boolean().optional(),
})

function reached(signals: PlusNudgeSignals, trigger: PlusNudgeTrigger): boolean {
  if (trigger === 'firstPhoto') return signals.photo >= 1
  if (trigger === 'carnetValue') return signals.animal >= 2 || signals.entry >= PLUS_NUDGE_ENTRIES
  return signals.export >= 1
}

export function readPlusNudgeState(): PlusNudgeState {
  try {
    const raw = localStorage.getItem(PLUS_NUDGE_STORAGE_KEY)
    if (raw === null) return NO_PLUS_NUDGE
    const parsed = stateSchema.safeParse(JSON.parse(raw))
    return parsed.success ? { ...NO_PLUS_NUDGE, ...parsed.data } : NO_PLUS_NUDGE
  } catch {
    return NO_PLUS_NUDGE
  }
}

function write(state: PlusNudgeState): void {
  try {
    localStorage.setItem(PLUS_NUDGE_STORAGE_KEY, JSON.stringify(state))
  } catch (cause) {
    console.warn('Rappel MémoPatte Plus non enregistré :', cause)
  }
}

export function markPlusNudgeShown(trigger: PlusNudgeTrigger): void {
  const state = readPlusNudgeState()
  write({
    ...state,
    shown: state.shown.includes(trigger) ? state.shown : [...state.shown, trigger],
    lastShownAt: new Date().toISOString(),
  })
}

export function stopPlusNudges(): void {
  write({ ...readPlusNudgeState(), stopped: true })
}

export function pendingPlusNudge(
  state: PlusNudgeState,
  signals: PlusNudgeSignals,
  now: Date,
): PlusNudgeTrigger | null {
  if (state.stopped) return null
  if (
    state.lastShownAt !== null &&
    differenceInCalendarDays(now, parseISO(state.lastShownAt)) < PLUS_NUDGE_SPACING_DAYS
  )
    return null
  return (
    PLUS_NUDGE_TRIGGERS.find(
      (trigger) => !state.shown.includes(trigger) && reached(signals, trigger),
    ) ?? null
  )
}

export function nextPlusNudge(now = new Date()): PlusNudgeTrigger | null {
  return pendingPlusNudge(readPlusNudgeState(), readPlusNudgeSignals(), now)
}
