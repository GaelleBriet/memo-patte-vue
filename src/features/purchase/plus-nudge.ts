import { differenceInCalendarDays, parseISO } from 'date-fns'
import { z } from 'zod'

import { readUsageSignals, type UsageSignals } from '@/shared/usage-signals'

export const PLUS_NUDGE_STORAGE_KEY = 'memopatte.plus.nudge'

export const PLUS_NUDGE_SPACING_DAYS = 30

export const PLUS_NUDGE_ENTRIES = 10

export const PLUS_NUDGE_ANIMALS = 2

export const PLUS_NUDGE_TRIGGERS = ['firstPhoto', 'carnetValue', 'firstExport'] as const

export type PlusNudgeTrigger = (typeof PLUS_NUDGE_TRIGGERS)[number]

export type PlusNudgeState = {
  shown: PlusNudgeTrigger[]
  lastShownAt: string | null
  stopped: boolean
}

export type CarnetSize = { animals: number }

const NO_PLUS_NUDGE: PlusNudgeState = { shown: [], lastShownAt: null, stopped: false }

const stateSchema = z.object({
  shown: z.array(z.enum(PLUS_NUDGE_TRIGGERS)).optional(),
  lastShownAt: z.iso.datetime({ offset: true }).nullable().optional(),
  stopped: z.boolean().optional(),
})

/** Repli quand `localStorage` refuse d'écrire : un refus tient au moins la session. */
let session: PlusNudgeState | null = null

export function forgetPlusNudgeSession(): void {
  session = null
}

function fromStorage(): PlusNudgeState {
  try {
    const raw = localStorage.getItem(PLUS_NUDGE_STORAGE_KEY)
    if (raw === null) return NO_PLUS_NUDGE
    const parsed = stateSchema.safeParse(JSON.parse(raw))
    return parsed.success ? { ...NO_PLUS_NUDGE, ...parsed.data } : NO_PLUS_NUDGE
  } catch {
    return NO_PLUS_NUDGE
  }
}

export function readPlusNudgeState(): PlusNudgeState {
  return session ?? fromStorage()
}

function write(state: PlusNudgeState): void {
  try {
    localStorage.setItem(PLUS_NUDGE_STORAGE_KEY, JSON.stringify(state))
    session = null
  } catch (cause) {
    session = state
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

/** `undefined` : moment de valeur pas atteint. Sinon sa date, `null` quand elle est inconnue. */
function reachedAt(
  trigger: PlusNudgeTrigger,
  signals: UsageSignals,
  carnet: CarnetSize,
): string | null | undefined {
  if (trigger === 'firstPhoto') return signals.photo.count >= 1 ? signals.photo.lastAt : undefined
  if (trigger === 'firstExport')
    return signals.export.count >= 1 ? signals.export.lastAt : undefined
  if (signals.entry.count >= PLUS_NUDGE_ENTRIES) return signals.entry.lastAt
  return carnet.animals >= PLUS_NUDGE_ANIMALS ? null : undefined
}

export function pendingPlusNudge(
  state: PlusNudgeState,
  signals: UsageSignals,
  carnet: CarnetSize,
  now: Date,
): PlusNudgeTrigger | null {
  if (state.stopped) return null
  if (
    state.lastShownAt !== null &&
    differenceInCalendarDays(now, parseISO(state.lastShownAt)) < PLUS_NUDGE_SPACING_DAYS
  )
    return null

  const candidates = PLUS_NUDGE_TRIGGERS.filter((trigger) => !state.shown.includes(trigger))
    .map((trigger) => ({ trigger, at: reachedAt(trigger, signals, carnet) }))
    .filter((candidate) => candidate.at !== undefined)

  // Le moment de valeur le plus frais parle le premier ; sans date connue, il passe après.
  return candidates.sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''))[0]?.trigger ?? null
}

/** Une horloge qui recule gèlerait les rappels jusqu'à la date déjà écrite. */
function withSaneClock(state: PlusNudgeState, now: Date): PlusNudgeState {
  if (state.lastShownAt === null || parseISO(state.lastShownAt) <= now) return state
  const corrected = { ...state, lastShownAt: now.toISOString() }
  write(corrected)
  return corrected
}

export function nextPlusNudge(carnet: CarnetSize, now = new Date()): PlusNudgeTrigger | null {
  return pendingPlusNudge(withSaneClock(readPlusNudgeState(), now), readUsageSignals(), carnet, now)
}
