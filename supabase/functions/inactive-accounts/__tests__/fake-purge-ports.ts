import type { RevenuecatSubscriber } from '../../_shared/plus-access'
import type { EmailChannel } from '../email-channel'
import type { WarningEmail } from '../messages'
import type { AccountDates } from '../purge-calendar'
import type { PurgeCandidate, PurgePassPorts, SavedNotice } from '../purge-pass'

export type PurgeCall = {
  kind:
    | 'list'
    | 'read'
    | 'revenuecat-read'
    | 'revenuecat-erase'
    | 'send'
    | 'save'
    | 'posthog'
    | 'photos'
    | 'deleteUser'
    | 'record'
  userId?: string
  arg?: unknown
}

const NO_NOTICE = { purgeOn: null, warnedAt: null, revenuecatErasedAt: null }

export function candidate(
  userId: string,
  dates: Partial<AccountDates>,
  contact: { email?: string; locale?: string | null } = {},
): PurgeCandidate {
  return {
    userId,
    email: contact.email ?? `${userId}@exemple.test`,
    locale: contact.locale ?? 'fr',
    dates: {
      createdAt: '2025-01-01T08:00:00.000Z',
      emailConfirmed: true,
      plus: null,
      notice: NO_NOTICE,
      ...dates,
    },
  }
}

export function fakePurgePorts(
  options: {
    candidates?: PurgeCandidate[]
    fresh?: Record<string, PurgeCandidate | null>
    subscribers?: Record<string, RevenuecatSubscriber>
    revenuecat?: boolean
    channel?: 'connected' | 'absent'
    failOn?: { kind: PurgeCall['kind']; userId?: string }
    invalidProviderSettings?: string[]
  } = {},
) {
  const candidates = options.candidates ?? []
  const calls: PurgeCall[] = []
  const sent: WarningEmail[] = []
  const notices: Record<string, SavedNotice> = {}

  function call(kind: PurgeCall['kind'], userId?: string, arg?: unknown) {
    calls.push({ kind, userId, arg })
    const fail = options.failOn
    if (fail?.kind === kind && (fail.userId === undefined || fail.userId === userId)) {
      throw new Error(`${kind} injoignable pour ${userId} <${userId}@exemple.test>`)
    }
  }

  const channel: EmailChannel =
    options.channel === 'absent'
      ? {
          connected: false,
          async send() {
            call('send')
            throw new Error('aucun canal')
          },
        }
      : {
          connected: true,
          async send(email) {
            call('send', undefined, email.to)
            sent.push(email)
          },
        }

  const ports: PurgePassPorts = {
    async listCandidates(at) {
      call('list', undefined, at)
      return candidates
    },
    async readCandidate(userId, at) {
      call('read', userId, at)
      if (options.fresh && userId in options.fresh) return options.fresh[userId] ?? null
      return candidates.find((c) => c.userId === userId) ?? null
    },
    revenuecat:
      options.revenuecat === false
        ? null
        : {
            async read(userId) {
              call('revenuecat-read', userId)
              return options.subscribers?.[userId] ?? {}
            },
            async erase(userId) {
              call('revenuecat-erase', userId)
            },
          },
    channel,
    async saveNotice(userId, notice) {
      call('save', userId, notice)
      notices[userId] = notice
    },
    erasure: {
      async listPhotos(folder) {
        call('photos', folder)
        return []
      },
      async removePhotos() {},
      providerErasures: [async (userId) => call('posthog', userId)],
      erasuresAfterDeletion: [],
      invalidProviderSettings: options.invalidProviderSettings ?? [],
      async deleteUser(userId) {
        call('deleteUser', userId)
      },
      async recordDeletion(origin) {
        call('record', undefined, origin)
      },
    },
  }

  return { ports, calls, sent, notices }
}
