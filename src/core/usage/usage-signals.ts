import { z } from 'zod'

export const USAGE_SIGNALS_STORAGE_KEY = 'memopatte.usage.signals'

/** Au-delà, le compteur n'apprend plus rien : il cesse de grandir. */
export const USAGE_SIGNAL_CAP = 999

/** `care` : un vaccin ou un traitement créé, « Reprendre » compris ; ni pesée, ni prise, ni import. */
export type UsageSignal = 'photo' | 'entry' | 'export' | 'jsonShare' | 'care'

export type UsageSignalTally = { count: number; firstAt: string | null; lastAt: string | null }

export type UsageSignals = Record<UsageSignal, UsageSignalTally>

const NEVER: UsageSignalTally = { count: 0, firstAt: null, lastAt: null }

/** Ce que le carnet a vécu sur ce téléphone : il y reste après une déconnexion, ses copies aussi. */
const CARNET_SIGNALS = ['care', 'jsonShare'] as const satisfies readonly UsageSignal[]

export const NO_USAGE_SIGNALS: UsageSignals = {
  photo: NEVER,
  entry: NEVER,
  export: NEVER,
  jsonShare: NEVER,
  care: NEVER,
}

const date = z.iso.datetime({ offset: true }).nullable()

const tally = z
  .object({ count: z.number().int().nonnegative(), firstAt: date.default(null), lastAt: date })
  .optional()

const signalsSchema = z.object({
  photo: tally,
  entry: tally,
  export: tally,
  jsonShare: tally,
  care: tally,
})

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

export function clearUsageSignals(): void {
  try {
    localStorage.removeItem(USAGE_SIGNALS_STORAGE_KEY)
  } catch (cause) {
    console.warn('Signaux d’usage non effacés :', cause)
  }
}

/** Déconnexion : les compteurs du compte s'effacent, ce que le carnet a vécu reste. */
export function clearAccountUsageSignals(): void {
  const signals = readUsageSignals()
  clearUsageSignals()
  const kept = CARNET_SIGNALS.filter((signal) => signals[signal].count > 0)
  if (kept.length === 0) return
  write({
    ...NO_USAGE_SIGNALS,
    ...Object.fromEntries(kept.map((signal) => [signal, signals[signal]])),
  })
}

function write(signals: UsageSignals): void {
  try {
    localStorage.setItem(USAGE_SIGNALS_STORAGE_KEY, JSON.stringify(signals))
  } catch (cause) {
    console.warn('Signal d’usage non enregistré :', cause)
  }
}

export function recordUsageSignal(signal: UsageSignal): void {
  const signals = readUsageSignals()
  const now = new Date().toISOString()
  write({
    ...signals,
    [signal]: {
      count: Math.min(signals[signal].count + 1, USAGE_SIGNAL_CAP),
      firstAt: signals[signal].firstAt ?? now,
      lastAt: now,
    },
  })
}

const CARE_BACKFILL_KEY = 'memopatte.usage.careBackfilled'

export function isCareBackfillDone(): boolean {
  try {
    return localStorage.getItem(CARE_BACKFILL_KEY) === 'true'
  } catch {
    return false
  }
}

/**
 * Une fois par appareil, pour un carnet rempli avant le signal `care` : il prend la date du plus
 * ancien soin. Fait aussi sur un carnet vide, pour qu'un import ultérieur ne compte pas.
 */
export function backfillCareSignal(oldestCareAt: string | null): void {
  const signals = readUsageSignals()
  if (oldestCareAt !== null && signals.care.count === 0) {
    write({ ...signals, care: { count: 1, firstAt: oldestCareAt, lastAt: oldestCareAt } })
  }
  try {
    localStorage.setItem(CARE_BACKFILL_KEY, 'true')
  } catch (cause) {
    console.warn('Rattrapage des soins non retenu :', cause)
  }
}
