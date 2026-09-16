import { z } from 'zod'

export const USAGE_SIGNALS_STORAGE_KEY = 'memopatte.usage.signals'

/** Au-delà, le compteur n'apprend plus rien : il cesse de grandir. */
export const USAGE_SIGNAL_CAP = 999

export type UsageSignal = 'photo' | 'entry' | 'export'

export type UsageSignalTally = { count: number; lastAt: string | null }

export type UsageSignals = Record<UsageSignal, UsageSignalTally>

const NEVER: UsageSignalTally = { count: 0, lastAt: null }

export const NO_USAGE_SIGNALS: UsageSignals = { photo: NEVER, entry: NEVER, export: NEVER }

const tally = z
  .object({
    count: z.number().int().nonnegative(),
    lastAt: z.iso.datetime({ offset: true }).nullable(),
  })
  .optional()

const signalsSchema = z.object({ photo: tally, entry: tally, export: tally })

export function readUsageSignals(): UsageSignals {
  try {
    const raw = localStorage.getItem(USAGE_SIGNALS_STORAGE_KEY)
    if (raw === null) return NO_USAGE_SIGNALS
    const parsed = signalsSchema.safeParse(JSON.parse(raw))
    return parsed.success ? { ...NO_USAGE_SIGNALS, ...parsed.data } : NO_USAGE_SIGNALS
  } catch {
    return NO_USAGE_SIGNALS
  }
}

export function recordUsageSignal(signal: UsageSignal): void {
  const signals = readUsageSignals()
  const next: UsageSignals = {
    ...signals,
    [signal]: {
      count: Math.min(signals[signal].count + 1, USAGE_SIGNAL_CAP),
      lastAt: new Date().toISOString(),
    },
  }
  try {
    localStorage.setItem(USAGE_SIGNALS_STORAGE_KEY, JSON.stringify(next))
  } catch (cause) {
    console.warn('Signal d’usage non enregistré :', cause)
  }
}
