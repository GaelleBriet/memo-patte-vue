import {
  eraseAccount,
  ErasureNotConfiguredError,
  type AccountErasurePorts,
  type ProviderErasure,
} from '../_shared/account-erasure.ts'
import { plusAccessFrom, type RevenuecatSubscriber } from '../_shared/plus-access.ts'
import type { EmailChannel } from './email-channel.ts'
import { warningEmail, type InactivityCause } from './messages.ts'
import {
  inactiveSinceOf,
  purgeDateOf,
  purgeStepsOf,
  type AccountDates,
  type PurgeNotice,
  type PurgeSteps,
} from './purge-calendar.ts'

export const MAX_DELETIONS_PER_PASS = 10

export type PurgeMode = 'dry-run' | 'apply'

export type PurgeCandidate = {
  userId: string
  email: string | null
  locale: string | null
  dates: AccountDates
}

type RevenuecatPorts = {
  read(userId: string): Promise<RevenuecatSubscriber>
  erase: ProviderErasure
}

export type SavedNotice = PurgeNotice & { inactiveSince: string }

export type PurgePassPorts = {
  /** Les comptes qui ont une étape due à l'instant donné. */
  listCandidates(at: string): Promise<PurgeCandidate[]>
  /** `null` : le compte n'existe plus ou n'a plus d'étape due. */
  readCandidate(userId: string, at: string): Promise<PurgeCandidate | null>
  /** `null` : RevenueCat désactivé ; la passe reste alors à blanc. */
  revenuecat: RevenuecatPorts | null
  channel: EmailChannel
  saveNotice(userId: string, notice: SavedNotice): Promise<void>
  erasure: AccountErasurePorts
}

export type PurgeReport = {
  mode: PurgeMode
  channel: 'connected' | 'absent'
  revenuecat: 'connected' | 'absent'
  due: {
    warnings: number
    deletions: number
    revenuecatErasures: number
    unconfirmedDeletions: number
  }
  done: {
    warnings: number
    deletions: number
    revenuecatErasures: number
    unconfirmedDeletions: number
  }
  skipped: { reactivated: number; batchFull: number }
  failures: { database: number; revenuecat: number; email: number; deletion: number }
}

type Failure = keyof PurgeReport['failures']

class StepFailure extends Error {
  constructor(readonly failure: Failure) {
    super(failure)
  }
}

async function attempt<T>(failure: Failure, action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch {
    throw new StepFailure(failure)
  }
}

function emptyReport(mode: PurgeMode, ports: PurgePassPorts): PurgeReport {
  return {
    mode,
    channel: ports.channel.connected ? 'connected' : 'absent',
    revenuecat: ports.revenuecat ? 'connected' : 'absent',
    due: { warnings: 0, deletions: 0, revenuecatErasures: 0, unconfirmedDeletions: 0 },
    done: { warnings: 0, deletions: 0, revenuecatErasures: 0, unconfirmedDeletions: 0 },
    skipped: { reactivated: 0, batchFull: 0 },
    failures: { database: 0, revenuecat: 0, email: 0, deletion: 0 },
  }
}

function countDue(report: PurgeReport, steps: PurgeSteps): void {
  if (steps.account === 'warn') report.due.warnings++
  if (steps.account === 'delete') report.due.deletions++
  if (steps.account === 'unconfirmed-pending') report.due.unconfirmedDeletions++
  if (steps.eraseRevenuecat) report.due.revenuecatErasures++
}

function deletesAccount(steps: PurgeSteps): boolean {
  return steps.account === 'delete' || steps.account === 'unconfirmed-pending'
}

function needsAction(steps: PurgeSteps): boolean {
  return steps.account === 'warn' || deletesAccount(steps) || steps.eraseRevenuecat
}

/** Google Play rend l'accès à la date de reprise : une pause en cours vaut un abonnement. */
function pausedUntilLater(subscriber: RevenuecatSubscriber, now: number): boolean {
  return Object.values(subscriber.subscriptions ?? {}).some((purchase) => {
    const resumesAt = purchase?.auto_resume_date
    return typeof resumesAt === 'string' && Date.parse(resumesAt) > now
  })
}

/** Une reprise ou un achat que le webhook n'a pas écrit : RevenueCat en sait plus que la base. */
function resumedAtRevenuecat(
  subscriber: RevenuecatSubscriber,
  dates: AccountDates,
  now: number,
): boolean {
  if (pausedUntilLater(subscriber, now)) return true
  const access = plusAccessFrom(subscriber, now)
  if (!access) return false
  if (access.active || access.expiresAt === null) return true
  const known = dates.plus?.expiresAt
  if (typeof known !== 'string') return true
  return Date.parse(access.expiresAt) > Date.parse(known)
}

function causeOf(dates: AccountDates, since: string): InactivityCause {
  if (!dates.emailConfirmed) return { kind: 'unconfirmed' }
  return dates.plus
    ? { kind: 'plus-ended', accessEndedAt: dates.plus.expiresAt ?? since }
    : { kind: 'never-bought', createdAt: since }
}

type AccountOutcome = 'none' | 'reactivated' | 'batch-full'

type PassState = { now: number; deletionAttempts: number }

async function processAccount(
  userId: string,
  state: PassState,
  ports: PurgePassPorts,
  revenuecat: RevenuecatPorts,
  report: PurgeReport,
): Promise<AccountOutcome> {
  const { now } = state
  const at = new Date(now).toISOString()
  const fresh = await attempt('database', () => ports.readCandidate(userId, at))
  if (!fresh) return 'none'
  const steps = purgeStepsOf(fresh.dates, now)
  const since = inactiveSinceOf(fresh.dates, now)
  if (!needsAction(steps) || since === null) return 'none'

  const deletes = deletesAccount(steps)
  if (deletes && state.deletionAttempts >= MAX_DELETIONS_PER_PASS) return 'batch-full'

  const subscriber = await attempt('revenuecat', () => revenuecat.read(userId))
  if (resumedAtRevenuecat(subscriber, fresh.dates, now)) return 'reactivated'

  if (deletes) {
    state.deletionAttempts++
    await attempt('deletion', () => eraseAccount(userId, 'inactivity', ports.erasure))
    if (steps.account === 'delete') report.done.deletions++
    else report.done.unconfirmedDeletions++
    return 'none'
  }

  // Lire chez RevenueCat recrée le client qui n'y était plus : il repart aussitôt.
  await attempt('revenuecat', () => revenuecat.erase(userId))
  let notice: SavedNotice = { inactiveSince: since, ...fresh.dates.notice }
  if (steps.eraseRevenuecat) {
    notice = { ...notice, revenuecatErasedAt: at }
    await attempt('database', () => ports.saveNotice(userId, notice))
    report.done.revenuecatErasures++
  }

  if (steps.account !== 'warn' || fresh.email === null) return 'none'
  const purgeOn = purgeDateOf(since, now)
  const email = warningEmail(
    { email: fresh.email, locale: fresh.locale },
    causeOf(fresh.dates, since),
    purgeOn,
  )
  if (!email) return 'none'
  await attempt('email', () => ports.channel.send(email))
  await attempt('database', () => ports.saveNotice(userId, { ...notice, purgeOn, warnedAt: at }))
  report.done.warnings++
  return 'none'
}

/** À blanc, sans canal d'e-mail ou sans RevenueCat, la passe ne fait que compter : aucune écriture, aucun prestataire. */
export async function runPurgePass(ports: PurgePassPorts, mode: PurgeMode): Promise<PurgeReport> {
  const { revenuecat } = ports
  const wantsToApply = mode === 'apply' && ports.channel.connected
  if (wantsToApply && ports.erasure.invalidProviderSettings.length > 0) {
    throw new ErasureNotConfiguredError(ports.erasure.invalidProviderSettings)
  }
  const applies = wantsToApply && revenuecat !== null

  const state: PassState = { now: Date.now(), deletionAttempts: 0 }
  const report = emptyReport(mode, ports)
  const candidates = await ports.listCandidates(new Date(state.now).toISOString())
  const due = candidates.filter((candidate) => {
    const steps = purgeStepsOf(candidate.dates, state.now)
    countDue(report, steps)
    return needsAction(steps)
  })
  if (!applies) return report

  for (const { userId } of due) {
    try {
      const outcome = await processAccount(userId, state, ports, revenuecat, report)
      if (outcome === 'reactivated') report.skipped.reactivated++
      if (outcome === 'batch-full') report.skipped.batchFull++
    } catch (cause) {
      report.failures[cause instanceof StepFailure ? cause.failure : 'database']++
    }
  }
  return report
}
