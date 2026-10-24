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

export type SavedNotice = PurgeNotice & { inactiveSince: string }

export type PurgePassPorts = {
  /** Les comptes qui ont une étape due à l'instant donné. */
  listCandidates(at: string): Promise<PurgeCandidate[]>
  /** `null` : le compte n'existe plus ou n'a plus d'étape due. */
  readCandidate(userId: string, at: string): Promise<PurgeCandidate | null>
  /** `null` : RevenueCat désactivé, la base fait foi. */
  revenuecat: { read(userId: string): Promise<RevenuecatSubscriber>; erase: ProviderErasure } | null
  channel: EmailChannel
  saveNotice(userId: string, notice: SavedNotice): Promise<void>
  erasure: AccountErasurePorts
}

export type PurgeReport = {
  mode: PurgeMode
  channel: 'connected' | 'absent'
  due: {
    warnings: number
    deletions: number
    unconfirmedDeletions: number
    revenuecatErasures: number
  }
  done: { warnings: number; deletions: number; revenuecatErasures: number }
  skipped: { reactivated: number; unconfirmedPending: number; batchFull: number }
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

function emptyReport(mode: PurgeMode, channel: EmailChannel): PurgeReport {
  return {
    mode,
    channel: channel.connected ? 'connected' : 'absent',
    due: { warnings: 0, deletions: 0, unconfirmedDeletions: 0, revenuecatErasures: 0 },
    done: { warnings: 0, deletions: 0, revenuecatErasures: 0 },
    skipped: { reactivated: 0, unconfirmedPending: 0, batchFull: 0 },
    failures: { database: 0, revenuecat: 0, email: 0, deletion: 0 },
  }
}

function countDue(report: PurgeReport, steps: PurgeSteps): void {
  if (steps.account === 'warn') report.due.warnings++
  if (steps.account === 'delete') report.due.deletions++
  if (steps.account === 'delete-unconfirmed') report.due.unconfirmedDeletions++
  if (steps.eraseRevenuecat) report.due.revenuecatErasures++
}

function hasStep(steps: PurgeSteps): boolean {
  return steps.account !== null || steps.eraseRevenuecat
}

/** Une reprise que le webhook n'a pas encore écrite : RevenueCat montre un accès actif ou une fin plus tardive. */
function resumedAtRevenuecat(subscriber: RevenuecatSubscriber, dates: AccountDates, now: number) {
  const access = plusAccessFrom(subscriber, now)
  if (!access) return false
  if (access.active || access.expiresAt === null) return true
  const known = dates.plus?.expiresAt
  return typeof known === 'string' && Date.parse(access.expiresAt) > Date.parse(known)
}

function causeOf(dates: AccountDates, since: string): InactivityCause {
  if (!dates.emailConfirmed) return { kind: 'unconfirmed' }
  return dates.plus
    ? { kind: 'plus-ended', accessEndedAt: since }
    : { kind: 'never-bought', createdAt: since }
}

type AccountOutcome = 'none' | 'reactivated' | 'unconfirmed-pending' | 'batch-full'

async function processAccount(
  userId: string,
  now: number,
  ports: PurgePassPorts,
  report: PurgeReport,
): Promise<AccountOutcome> {
  const at = new Date(now).toISOString()
  const fresh = await attempt('database', () => ports.readCandidate(userId, at))
  if (!fresh) return 'none'
  const steps = purgeStepsOf(fresh.dates, now)
  const since = inactiveSinceOf(fresh.dates, now)
  if (!hasStep(steps) || since === null) return 'none'
  if (steps.account === 'delete-unconfirmed') return 'unconfirmed-pending'

  const deletes = steps.account === 'delete'
  if (deletes && report.done.deletions >= MAX_DELETIONS_PER_PASS) return 'batch-full'

  const { revenuecat } = ports
  const readsRevenuecat = revenuecat !== null && fresh.dates.plus !== null
  if (readsRevenuecat) {
    const subscriber = await attempt('revenuecat', () => revenuecat.read(userId))
    if (resumedAtRevenuecat(subscriber, fresh.dates, now)) return 'reactivated'
  }

  if (deletes) {
    await attempt('deletion', () => eraseAccount(userId, 'inactivity', ports.erasure))
    report.done.deletions++
    return 'none'
  }

  let notice: SavedNotice = { inactiveSince: since, ...fresh.dates.notice }
  if (steps.eraseRevenuecat && revenuecat) {
    await attempt('revenuecat', () => revenuecat.erase(userId))
    notice = { ...notice, revenuecatErasedAt: at }
    await attempt('database', () => ports.saveNotice(userId, notice))
    report.done.revenuecatErasures++
  } else if (readsRevenuecat && notice.revenuecatErasedAt !== null) {
    await attempt('revenuecat', () => revenuecat.erase(userId))
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

/** À blanc ou sans canal d'e-mail, la passe ne fait que compter : aucune écriture, aucun prestataire. */
export async function runPurgePass(ports: PurgePassPorts, mode: PurgeMode): Promise<PurgeReport> {
  const applies = mode === 'apply' && ports.channel.connected
  if (applies && ports.erasure.invalidProviderSettings.length > 0) {
    throw new ErasureNotConfiguredError(ports.erasure.invalidProviderSettings)
  }

  const now = Date.now()
  const report = emptyReport(mode, ports.channel)
  const candidates = await ports.listCandidates(new Date(now).toISOString())
  const due = candidates.filter((candidate) => {
    const steps = purgeStepsOf(candidate.dates, now)
    countDue(report, steps)
    return hasStep(steps)
  })
  if (!applies) return report

  for (const { userId } of due) {
    try {
      const outcome = await processAccount(userId, now, ports, report)
      if (outcome === 'reactivated') report.skipped.reactivated++
      if (outcome === 'unconfirmed-pending') report.skipped.unconfirmedPending++
      if (outcome === 'batch-full') report.skipped.batchFull++
    } catch (cause) {
      report.failures[cause instanceof StepFailure ? cause.failure : 'database']++
    }
  }
  return report
}
