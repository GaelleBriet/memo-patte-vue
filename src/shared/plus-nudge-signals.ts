import { z } from 'zod'

export const PLUS_NUDGE_SIGNALS_STORAGE_KEY = 'memopatte.plus.nudge.signals'

export type PlusNudgeSignal = 'photo' | 'animal' | 'entry' | 'export'

export type PlusNudgeSignals = Record<PlusNudgeSignal, number>

export const NO_PLUS_NUDGE_SIGNALS: PlusNudgeSignals = {
  photo: 0,
  animal: 0,
  entry: 0,
  export: 0,
}

const count = z.number().int().nonnegative().optional()

const signalsSchema = z.object({
  photo: count,
  animal: count,
  entry: count,
  export: count,
})

export function readPlusNudgeSignals(): PlusNudgeSignals {
  try {
    const raw = localStorage.getItem(PLUS_NUDGE_SIGNALS_STORAGE_KEY)
    if (raw === null) return NO_PLUS_NUDGE_SIGNALS
    const parsed = signalsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? { ...NO_PLUS_NUDGE_SIGNALS, ...parsed.data } : NO_PLUS_NUDGE_SIGNALS
  } catch {
    return NO_PLUS_NUDGE_SIGNALS
  }
}

export function recordPlusNudgeSignal(signal: PlusNudgeSignal): void {
  const signals = readPlusNudgeSignals()
  const next: PlusNudgeSignals = { ...signals, [signal]: signals[signal] + 1 }
  try {
    localStorage.setItem(PLUS_NUDGE_SIGNALS_STORAGE_KEY, JSON.stringify(next))
  } catch (cause) {
    console.warn('Signal MémoPatte Plus non enregistré :', cause)
  }
}
