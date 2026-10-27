import {
  eraseAccount,
  ErasureNotConfiguredError,
  type AccountErasurePorts,
  type ProviderErasure,
} from '../_shared/account-erasure.ts'
import type { RevenuecatSubscriber } from '../_shared/plus-access.ts'
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
import { readAtRevenuecat } from './revenuecat-reading.ts'

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
  skipped: { reactivated: number; batchFull: number; laterEnd: number }
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
    skipped: { reactivated: 0, batchFull: 0, laterEnd: 0 },
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

/** Une suppression annoncée par e-mail ne cède jamais sa place dans le lot à une adresse jamais confirmée. */
function passOrder(steps: PurgeSteps): number {
  if (steps.account === 'delete') return 0
  if (steps.account === 'unconfirmed-pending') return 2
  return 1
}

function causeOf(dates: AccountDates, since: string): InactivityCause {
  if (!dates.emailConfirmed) return { kind: 'unconfirmed' }
  return dates.plus
    ? { kind: 'plus-ended', accessEndedAt: dates.plus.expiresAt ?? since }
    : { kind: 'never-bought', createdAt: since }
}

type AccountOutcome = 'none' | 'reactivated' | 'batch-full' | 'later-end'

type PassState = { now: number; deletionAttempts: number }

async function processAccount(
  userId: string,
  listed: PurgeSteps,
  state: PassState,
  ports: PurgePassPorts,
  revenuecat: RevenuecatPorts,
  report: PurgeReport,
): Promise<AccountOutcome> {
  const { now } = state
  const batchFull = () => state.deletionAttempts >= MAX_DELETIONS_PER_PASS
  if (deletesAccount(listed) && batchFull()) return 'batch-full'
  const at = new Date(now).toISOString()
  const fresh = await attempt('database', () => ports.readCandidate(userId, at))
  if (!fresh) return 'none'
  const listedSteps = purgeStepsOf(fresh.dates, now)
  const noticeSince = inactiveSinceOf(fresh.dates, now)
  if (!needsAction(listedSteps) || noticeSince === null) return 'none'
  if (deletesAccount(listedSteps) && batchFull()) return 'batch-full'

  const subscriber = await attempt('revenuecat', () => revenuecat.read(userId))
  const reading = readAtRevenuecat(subscriber, fresh.dates, now)
  if (reading.subscribed) return 'reactivated'
  const { dates, laterEnd } = reading
  const steps = purgeStepsOf(dates, now)
  const since = inactiveSinceOf(dates, now)
  if (since === null) return 'none'
  if (laterEnd && steps.account === null) return 'later-end'

  if (deletesAccount(steps)) {
    state.deletionAttempts++
    await attempt('deletion', () => eraseAccount(userId, 'inactivity', ports.erasure))
    if (steps.account === 'delete') report.done.deletions++
    else report.done.unconfirmedDeletions++
    return 'none'
  }

  let notice: SavedNotice = { inactiveSince: noticeSince, ...dates.notice }
  if (!laterEnd) {
    // Lire chez RevenueCat recrée le client qui n'y était plus : il repart aussitôt.
    await attempt('revenuecat', () => revenuecat.erase(userId))
    if (steps.eraseRevenuecat) {
      notice = { ...notice, revenuecatErasedAt: at }
      await attempt('database', () => ports.saveNotice(userId, notice))
      report.done.revenuecatErasures++
    }
  }

  if (steps.account !== 'warn' || fresh.email === null) return 'none'
  const purgeOn = purgeDateOf(since, now)
  const email = warningEmail(
    { email: fresh.email, locale: fresh.locale },
    causeOf(dates, since),
    purgeOn,
  )
  if (!email) return 'none'
  await attempt('email', () => ports.channel.send(email))
  await attempt('database', () => ports.saveNotice(userId, { ...notice, purgeOn, warnedAt: at }))
  report.done.warnings++
  // RevenueCat garde seul cette fin d'accès : il n'est effacé qu'une fois l'avis enregistré.
  if (laterEnd) await attempt('revenuecat', () => revenuecat.erase(userId))
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
  const due = candidates
    .map(({ userId, dates }) => ({
      userId,
      createdAt: Date.parse(dates.createdAt),
      steps: purgeStepsOf(dates, state.now),
    }))
    .filter(({ steps }) => {
      countDue(report, steps)
      return needsAction(steps)
    })
    .sort((a, b) => passOrder(a.steps) - passOrder(b.steps) || a.createdAt - b.createdAt)
  if (!applies) return report

  for (const { userId, steps } of due) {
    try {
      const outcome = await processAccount(userId, steps, state, ports, revenuecat, report)
      if (outcome === 'reactivated') report.skipped.reactivated++
      if (outcome === 'batch-full') report.skipped.batchFull++
      if (outcome === 'later-end') report.skipped.laterEnd++
    } catch (cause) {
      report.failures[cause instanceof StepFailure ? cause.failure : 'database']++
    }
  }
  return report
}
