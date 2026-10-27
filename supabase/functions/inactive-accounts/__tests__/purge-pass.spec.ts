// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ErasureNotConfiguredError } from '../../_shared/account-erasure'
import { NO_EMAIL_CHANNEL } from '../email-channel'
import { MAX_DELETIONS_PER_PASS, runPurgePass } from '../purge-pass'
import { candidate, fakePurgePorts } from './fake-purge-ports'

const NOW = '2027-11-20T03:00:00.000Z'

const WARN = candidate('aaaaaaaa-0000-4000-8000-000000000001', {
  plus: { expiresAt: '2026-11-15T14:00:00.000Z' },
  notice: { purgeOn: null, warnedAt: null, revenuecatErasedAt: '2027-01-15T03:00:00.000Z' },
})
const DELETE = candidate('aaaaaaaa-0000-4000-8000-000000000002', {
  plus: { expiresAt: '2026-10-01T10:00:00.000Z' },
  notice: {
    purgeOn: '2027-11-19',
    warnedAt: '2027-09-02T03:00:00.000Z',
    revenuecatErasedAt: '2026-12-01T03:00:00.000Z',
  },
})
const UNCONFIRMED = candidate('aaaaaaaa-0000-4000-8000-000000000003', {
  createdAt: '2027-11-10T10:00:00.000Z',
  emailConfirmed: false,
})
const REVENUECAT = candidate('aaaaaaaa-0000-4000-8000-000000000004', {
  plus: { expiresAt: '2027-09-01T10:00:00.000Z' },
})
const NEVER_BOUGHT = candidate('aaaaaaaa-0000-4000-8000-000000000005', {
  createdAt: '2026-12-01T10:00:00.000Z',
})
const ALL = [WARN, DELETE, UNCONFIRMED, REVENUECAT, NEVER_BOUGHT]

const ZERO_DONE = { warnings: 0, deletions: 0, revenuecatErasures: 0, unconfirmedDeletions: 0 }
const ZERO_DUE = { warnings: 0, deletions: 0, revenuecatErasures: 0, unconfirmedDeletions: 0 }
const ZERO_SKIPPED = { reactivated: 0, batchFull: 0, laterEnd: 0 }
const ZERO_FAILURES = { database: 0, revenuecat: 0, email: 0, deletion: 0 }
const ALL_DUE = { warnings: 2, deletions: 1, revenuecatErasures: 1, unconfirmedDeletions: 1 }
const ACTIVE_UNTIL_2028 = {
  entitlements: {
    plus: { expires_date: '2028-11-01T00:00:00Z', product_identifier: 'plus:annual' },
  },
}

function useClock(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(iso) })
}

beforeEach(() => useClock(NOW))
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('runPurgePass à blanc', () => {
  it('compte les étapes dues sans rien relire, envoyer, écrire ni supprimer', async () => {
    const fake = fakePurgePorts({ candidates: ALL })

    const report = await runPurgePass(fake.ports, 'dry-run')

    expect(report).toEqual({
      mode: 'dry-run',
      channel: 'connected',
      revenuecat: 'connected',
      due: ALL_DUE,
      done: ZERO_DONE,
      skipped: ZERO_SKIPPED,
      failures: ZERO_FAILURES,
    })
    expect(fake.calls).toEqual([{ kind: 'list', userId: undefined, arg: NOW }])
  })

  it('n’a pas besoin des réglages des prestataires', async () => {
    const fake = fakePurgePorts({
      candidates: ALL,
      invalidProviderSettings: ['REVENUECAT_SECRET_KEY'],
    })

    const report = await runPurgePass(fake.ports, 'dry-run')

    expect(report.due).toEqual(ALL_DUE)
  })
})

describe('runPurgePass sans canal d’e-mail branché', () => {
  it('ne supprime rien, n’envoie rien et n’efface rien chez RevenueCat, même un compte jamais confirmé', async () => {
    const fake = fakePurgePorts({ candidates: ALL, channel: 'absent' })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report).toEqual({
      mode: 'apply',
      channel: 'absent',
      revenuecat: 'connected',
      due: ALL_DUE,
      done: ZERO_DONE,
      skipped: ZERO_SKIPPED,
      failures: ZERO_FAILURES,
    })
    expect(fake.calls.map((c) => c.kind)).toEqual(['list'])
  })

  it('le seul canal fourni, « aucun canal branché », refuse d’envoyer : rien n’est supprimé', async () => {
    const fake = fakePurgePorts({ candidates: ALL })

    const report = await runPurgePass({ ...fake.ports, channel: NO_EMAIL_CHANNEL }, 'apply')

    expect(report.channel).toBe('absent')
    expect(report.done).toEqual(ZERO_DONE)
    expect(fake.calls.map((c) => c.kind)).toEqual(['list'])
    const email = { from: 'expéditeur', to: 'destinataire', subject: 'objet', text: 'texte' }
    await expect(NO_EMAIL_CHANNEL.send(email)).rejects.toThrow('Aucun canal')
  })
})

describe('runPurgePass appliquée', () => {
  it('avertit, supprime et efface chez RevenueCat chaque compte dû', async () => {
    const fake = fakePurgePorts({ candidates: ALL })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report).toEqual({
      mode: 'apply',
      channel: 'connected',
      revenuecat: 'connected',
      due: ALL_DUE,
      done: { warnings: 2, deletions: 1, revenuecatErasures: 1, unconfirmedDeletions: 1 },
      skipped: ZERO_SKIPPED,
      failures: ZERO_FAILURES,
    })
    expect(fake.calls.filter((c) => c.kind === 'deleteUser').map((c) => c.userId)).toEqual([
      DELETE.userId,
      UNCONFIRMED.userId,
    ])
    expect(fake.calls.filter((c) => c.kind === 'record').map((c) => c.arg)).toEqual([
      'inactivity',
      'inactivity',
    ])
  })

  it('avertit à 11 mois avec la date J et garde l’avis', async () => {
    useClock('2027-10-16T03:00:00.000Z')
    const sophie = candidate(
      'aaaaaaaa-0000-4000-8000-000000000010',
      { plus: { expiresAt: '2026-11-15T14:00:00.000Z' } },
      { email: 'sophie@exemple.test', locale: 'fr' },
    )
    const fake = fakePurgePorts({ candidates: [sophie] })

    await runPurgePass(fake.ports, 'apply')

    expect(fake.sent).toHaveLength(1)
    expect(fake.sent[0]?.to).toBe('sophie@exemple.test')
    expect(fake.sent[0]?.subject).toBe('Votre compte MémoPatte sera supprimé le 16 novembre 2027')
    expect(fake.notices[sophie.userId]).toEqual({
      inactiveSince: '2026-11-15T14:00:00.000Z',
      purgeOn: '2027-11-16',
      warnedAt: '2027-10-16T03:00:00.000Z',
      revenuecatErasedAt: '2027-10-16T03:00:00.000Z',
    })
    expect(fake.calls.map((c) => c.kind)).toEqual([
      'list',
      'read',
      'revenuecat-read',
      'revenuecat-erase',
      'save',
      'send',
      'save',
    ])
  })

  it('achat restauré plus ancien que le compte : averti à 11 mois après la création, avec la vraie fin d’accès', async () => {
    useClock('2028-05-02T03:00:00.000Z')
    const restored = candidate('aaaaaaaa-0000-4000-8000-000000000023', {
      createdAt: '2027-06-01T10:00:00.000Z',
      plus: { expiresAt: '2026-01-01T00:00:00.000Z' },
    })
    const fake = fakePurgePorts({ candidates: [restored] })

    await runPurgePass(fake.ports, 'apply')

    expect(fake.sent[0]?.text).toContain('a pris fin le 1er\u00a0janvier\u00a02026.')
    expect(fake.notices[restored.userId]).toMatchObject({
      inactiveSince: '2027-06-01T10:00:00.000Z',
      purgeOn: '2028-06-02',
    })
  })

  it('avertissement en retard : la date J laisse 30 jours de préavis', async () => {
    const fake = fakePurgePorts({ candidates: [WARN] })

    await runPurgePass(fake.ports, 'apply')

    expect(fake.notices[WARN.userId]?.purgeOn).toBe('2027-12-21')
    expect(fake.sent[0]?.subject).toContain('21 décembre 2027')
  })

  it('relit RevenueCat puis efface de nouveau le client que la lecture a recréé', async () => {
    const fake = fakePurgePorts({ candidates: [WARN] })

    await runPurgePass(fake.ports, 'apply')

    expect(fake.calls.map((c) => c.kind)).toEqual([
      'list',
      'read',
      'revenuecat-read',
      'revenuecat-erase',
      'send',
      'save',
    ])
    expect(fake.notices[WARN.userId]?.revenuecatErasedAt).toBe('2027-01-15T03:00:00.000Z')
  })

  it('efface le client RevenueCat 60 jours après la fin et le note', async () => {
    const fake = fakePurgePorts({ candidates: [REVENUECAT] })

    await runPurgePass(fake.ports, 'apply')

    expect(fake.calls.map((c) => c.kind)).toEqual([
      'list',
      'read',
      'revenuecat-read',
      'revenuecat-erase',
      'save',
    ])
    expect(fake.notices[REVENUECAT.userId]).toEqual({
      inactiveSince: '2027-09-01T10:00:00.000Z',
      purgeOn: null,
      warnedAt: null,
      revenuecatErasedAt: NOW,
    })
  })

  it('avertit à 11 mois un compte confirmé qui n’a jamais acheté, avec la date de création', async () => {
    const fake = fakePurgePorts({ candidates: [NEVER_BOUGHT] })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.done.warnings).toBe(1)
    expect(fake.calls.map((c) => c.kind)).toEqual([
      'list',
      'read',
      'revenuecat-read',
      'revenuecat-erase',
      'send',
      'save',
    ])
    expect(fake.sent[0]?.text).toContain(
      'a été créé le 1er\u00a0décembre\u00a02026 sans abonnement Plus.',
    )
    expect(fake.sent[0]?.subject).toBe(
      'Votre compte MémoPatte sera supprimé le 21\u00a0décembre\u00a02027',
    )
    expect(fake.notices[NEVER_BOUGHT.userId]).toEqual({
      inactiveSince: '2026-12-01T10:00:00.000Z',
      purgeOn: '2027-12-21',
      warnedAt: NOW,
      revenuecatErasedAt: null,
    })
  })

  it('compte confirmé sans achat, averti à temps : supprimé à 12 mois après la création, pas avant', async () => {
    const created = '2026-01-10T08:00:00.000Z'
    useClock('2026-12-11T03:00:00.000Z')
    const paul = candidate('aaaaaaaa-0000-4000-8000-000000000013', { createdAt: created })
    const fake = fakePurgePorts({ candidates: [paul] })

    await runPurgePass(fake.ports, 'apply')

    const notice = fake.notices[paul.userId]!
    expect(notice.purgeOn).toBe('2027-01-11')
    const warned = candidate(paul.userId, { createdAt: created, notice })
    useClock('2027-01-11T23:59:59.999Z')
    const early = fakePurgePorts({ candidates: [warned] })
    await runPurgePass(early.ports, 'apply')
    expect(early.calls.map((c) => c.kind)).not.toContain('deleteUser')
    useClock('2027-01-12T03:00:00.000Z')
    const due = fakePurgePorts({ candidates: [warned] })
    await runPurgePass(due.ports, 'apply')
    expect(due.calls.find((c) => c.kind === 'deleteUser')?.userId).toBe(paul.userId)
  })

  it('compte confirmé sans achat jamais averti : jamais supprimé', async () => {
    useClock('2031-01-01T03:00:00.000Z')
    const fake = fakePurgePorts({ candidates: [NEVER_BOUGHT], failOn: { kind: 'send' } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.failures.email).toBe(1)
    expect(fake.calls.map((c) => c.kind)).not.toContain('deleteUser')
    expect(fake.notices).toEqual({})
  })

  it('ne supprime jamais un compte qui n’a pas été averti', async () => {
    const longAgo = candidate('aaaaaaaa-0000-4000-8000-000000000011', {
      plus: { expiresAt: '2024-01-01T00:00:00.000Z' },
      notice: { purgeOn: null, warnedAt: null, revenuecatErasedAt: '2024-03-01T00:00:00.000Z' },
    })
    const fake = fakePurgePorts({ candidates: [longAgo] })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.done).toEqual({ ...ZERO_DONE, warnings: 1 })
    expect(fake.calls.map((c) => c.kind)).not.toContain('deleteUser')
  })

  it('un avertissement qui n’est pas parti ne laisse aucun avis, donc aucune suppression', async () => {
    const fake = fakePurgePorts({ candidates: [WARN], failOn: { kind: 'send' } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.failures.email).toBe(1)
    expect(fake.notices).toEqual({})
  })
})

describe('runPurgePass : adresse jamais confirmée, supprimée au bout de 7 jours sans e-mail', () => {
  const CREATED = '2027-10-25T15:00:00.000Z'
  const SIX_DAYS_LATER = '2027-11-01T03:00:00.000Z'
  const SEVEN_DAYS_LATER = '2027-11-02T03:00:00.000Z'
  const NOE = candidate(
    'dddddddd-0000-4000-8000-000000000001',
    { createdAt: CREATED, emailConfirmed: false },
    { email: 'noe@exemple.test', locale: 'fr' },
  )

  function unconfirmedAccounts(count: number, prefix: string) {
    return Array.from({ length: count }, (_, index) =>
      candidate(`${prefix}-0000-4000-8000-${String(index).padStart(12, '0')}`, NOE.dates),
    )
  }

  it('créée il y a 6 jours : ni comptée, ni supprimée', async () => {
    useClock(SIX_DAYS_LATER)
    const fake = fakePurgePorts({ candidates: [NOE] })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.due).toEqual(ZERO_DUE)
    expect(report.done).toEqual(ZERO_DONE)
    expect(fake.calls.map((c) => c.kind)).toEqual(['list'])
  })

  it('créée il y a 7 jours, à blanc : comptée seulement', async () => {
    useClock(SEVEN_DAYS_LATER)
    const fake = fakePurgePorts({ candidates: [NOE] })

    const report = await runPurgePass(fake.ports, 'dry-run')

    expect(report.due).toEqual({ ...ZERO_DUE, unconfirmedDeletions: 1 })
    expect(report.done).toEqual(ZERO_DONE)
    expect(fake.calls.map((c) => c.kind)).toEqual(['list'])
  })

  it('créée il y a 7 jours, appliquée : relue, puis supprimée comme « Supprimer mon compte », sans e-mail', async () => {
    useClock(SEVEN_DAYS_LATER)
    const fake = fakePurgePorts({ candidates: [NOE] })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.done).toEqual({ ...ZERO_DONE, unconfirmedDeletions: 1 })
    expect(report.failures).toEqual(ZERO_FAILURES)
    expect(fake.calls.map((c) => c.kind)).toEqual([
      'list',
      'read',
      'revenuecat-read',
      'posthog',
      'photos',
      'deleteUser',
      'photos',
      'record',
    ])
    expect(fake.calls.find((c) => c.kind === 'record')?.arg).toBe('inactivity')
    expect(fake.sent).toEqual([])
    expect(fake.notices).toEqual({})
  })

  it('jamais d’e-mail, même des années plus tard ou après la fin d’un accès Plus', async () => {
    useClock('2031-01-01T03:00:00.000Z')
    const plusEnded = candidate('dddddddd-0000-4000-8000-000000000002', {
      createdAt: '2025-01-01T08:00:00.000Z',
      emailConfirmed: false,
      plus: { expiresAt: '2026-01-01T00:00:00.000Z' },
    })
    const fake = fakePurgePorts({ candidates: [NOE, plusEnded] })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.due).toEqual({ ...ZERO_DUE, unconfirmedDeletions: 2 })
    expect(report.done).toEqual({ ...ZERO_DONE, unconfirmedDeletions: 2 })
    expect(fake.sent).toEqual([])
    expect(fake.calls.map((c) => c.kind)).not.toContain('send')
    expect(fake.calls.map((c) => c.kind)).not.toContain('save')
  })

  it('adresse confirmée entre la liste et la relecture : rien', async () => {
    useClock(SEVEN_DAYS_LATER)
    const confirmed = { ...NOE, dates: { ...NOE.dates, emailConfirmed: true } }
    const fake = fakePurgePorts({ candidates: [NOE], fresh: { [NOE.userId]: confirmed } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.due).toEqual({ ...ZERO_DUE, unconfirmedDeletions: 1 })
    expect(report.done).toEqual(ZERO_DONE)
    expect(fake.calls.map((c) => c.kind)).toEqual(['list', 'read'])
  })

  it('RevenueCat montre un accès en cours : rien', async () => {
    useClock(SEVEN_DAYS_LATER)
    const fake = fakePurgePorts({
      candidates: [NOE],
      subscribers: { [NOE.userId]: ACTIVE_UNTIL_2028 },
    })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.skipped.reactivated).toBe(1)
    expect(fake.calls.map((c) => c.kind)).not.toContain('deleteUser')
  })

  it(`partage le lot de ${MAX_DELETIONS_PER_PASS} tentatives avec les autres suppressions`, async () => {
    const expired = Array.from({ length: 6 }, (_, index) =>
      candidate(`eeeeeeee-0000-4000-8000-${String(index).padStart(12, '0')}`, DELETE.dates),
    )
    const fake = fakePurgePorts({
      candidates: [...expired, ...unconfirmedAccounts(6, 'ffffffff')],
    })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(fake.calls.filter((c) => c.kind === 'deleteUser')).toHaveLength(10)
    expect(report.done).toEqual({ ...ZERO_DONE, deletions: 6, unconfirmedDeletions: 4 })
    expect(report.skipped.batchFull).toBe(2)
  })

  it('une suppression annoncée par e-mail passe avant les adresses jamais confirmées', async () => {
    useClock(SEVEN_DAYS_LATER)
    const camille = candidate('dddddddd-0000-4000-8000-000000000003', {
      plus: { expiresAt: '2026-10-01T10:00:00.000Z' },
      notice: {
        purgeOn: '2027-11-01',
        warnedAt: '2027-09-02T03:00:00.000Z',
        revenuecatErasedAt: '2026-12-01T03:00:00.000Z',
      },
    })
    const fake = fakePurgePorts({
      candidates: [...unconfirmedAccounts(MAX_DELETIONS_PER_PASS, '88888888'), camille],
    })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(fake.calls.filter((c) => c.kind === 'deleteUser')[0]?.userId).toBe(camille.userId)
    expect(report.done).toEqual({ ...ZERO_DONE, deletions: 1, unconfirmedDeletions: 9 })
    expect(report.skipped.batchFull).toBe(1)
  })

  it('premier inscrit, premier supprimé : les 10 adresses non confirmées les plus anciennes partent', async () => {
    useClock(SEVEN_DAYS_LATER)
    const accounts = Array.from({ length: 15 }, (_, index) =>
      candidate(`66666666-0000-4000-8000-${String(index).padStart(12, '0')}`, {
        createdAt: new Date(
          Date.parse('2027-10-01T08:00:00.000Z') + index * 3_600_000,
        ).toISOString(),
        emailConfirmed: false,
      }),
    )
    const listed = [...accounts].reverse()
    const fake = fakePurgePorts({ candidates: listed })

    await runPurgePass(fake.ports, 'apply')

    const deleted = fake.calls.filter((c) => c.kind === 'deleteUser').map((c) => c.userId)
    expect(deleted).toEqual(accounts.slice(0, MAX_DELETIONS_PER_PASS).map((a) => a.userId))
  })

  it('un avertissement part avant toute suppression d’adresse non confirmée de la même passe', async () => {
    useClock(NOW)
    const fake = fakePurgePorts({ candidates: [UNCONFIRMED, WARN] })

    await runPurgePass(fake.ports, 'apply')

    const kinds = fake.calls.map((c) => c.kind)
    expect(kinds).toContain('deleteUser')
    expect(kinds.indexOf('send')).toBeGreaterThan(-1)
    expect(kinds.indexOf('send')).toBeLessThan(kinds.indexOf('deleteUser'))
  })

  it('au-delà de la limite, une suppression due est sautée sans relecture', async () => {
    useClock(SEVEN_DAYS_LATER)
    const fake = fakePurgePorts({ candidates: unconfirmedAccounts(12, '77777777') })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(fake.calls.filter((c) => c.kind === 'read')).toHaveLength(MAX_DELETIONS_PER_PASS)
    expect(report.skipped.batchFull).toBe(2)
  })

  it('une suppression en échec compte comme tentative et n’arrête pas le lot', async () => {
    useClock(SEVEN_DAYS_LATER)
    const accounts = unconfirmedAccounts(12, '99999999')
    const fake = fakePurgePorts({
      candidates: accounts,
      failOn: { kind: 'deleteUser', userId: accounts[0]!.userId },
    })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.failures).toEqual({ ...ZERO_FAILURES, deletion: 1 })
    expect(report.done.unconfirmedDeletions).toBe(9)
    expect(report.skipped.batchFull).toBe(2)
  })

  it('ne journalise ni identifiant ni adresse, même en échec', async () => {
    useClock(SEVEN_DAYS_LATER)
    const lines: unknown[] = []
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args) => lines.push(...args))
    }
    const fake = fakePurgePorts({
      candidates: [NOE],
      failOn: { kind: 'deleteUser', userId: NOE.userId },
    })

    const report = await runPurgePass(fake.ports, 'apply')

    const written = JSON.stringify([lines.map(String), report])
    expect(report.failures.deletion).toBe(1)
    expect(written).not.toContain(NOE.userId)
    expect(written).not.toContain('@')
  })
})

describe('runPurgePass : relecture avant d’agir', () => {
  it('ne fait rien quand la relecture ne trouve plus d’étape due (Plus repris)', async () => {
    const fake = fakePurgePorts({ candidates: [DELETE, WARN], fresh: { [DELETE.userId]: null } })

    await runPurgePass(fake.ports, 'apply')

    expect(fake.calls.filter((c) => c.userId === DELETE.userId).map((c) => c.kind)).toEqual([
      'read',
    ])
  })

  it('ne fait rien quand les dates relues montrent un abonnement en cours', async () => {
    const resumed = {
      ...DELETE,
      dates: { ...DELETE.dates, plus: { expiresAt: '2028-11-01T00:00:00.000Z' } },
    }
    const fake = fakePurgePorts({ candidates: [DELETE], fresh: { [DELETE.userId]: resumed } })

    await runPurgePass(fake.ports, 'apply')

    expect(fake.calls.map((c) => c.kind)).toEqual(['list', 'read'])
  })

  it('n’avertit ni ne supprime un compte que RevenueCat montre de nouveau abonné', async () => {
    const active = {
      entitlements: {
        plus: { expires_date: '2028-11-01T00:00:00Z', product_identifier: 'plus:annual' },
      },
    }
    const fake = fakePurgePorts({
      candidates: [DELETE, WARN, REVENUECAT],
      subscribers: { [DELETE.userId]: active, [WARN.userId]: active, [REVENUECAT.userId]: active },
    })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.skipped.reactivated).toBe(3)
    expect(report.done).toEqual(ZERO_DONE)
    expect(fake.calls.map((c) => c.kind)).not.toContain('revenuecat-erase')
    expect(fake.calls.map((c) => c.kind)).not.toContain('deleteUser')
    expect(fake.sent).toEqual([])
  })

  it('fin d’accès plus récente chez RevenueCat que dans la base : compte depuis elle, sans effacer RevenueCat', async () => {
    const later = {
      entitlements: {
        plus: { expires_date: '2027-06-01T00:00:00Z', product_identifier: 'plus:annual' },
      },
    }
    const fake = fakePurgePorts({ candidates: [WARN], subscribers: { [WARN.userId]: later } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.skipped).toEqual({ ...ZERO_SKIPPED, laterEnd: 1 })
    expect(fake.sent).toEqual([])
    expect(fake.calls.map((c) => c.kind)).toEqual(['list', 'read', 'revenuecat-read'])
  })

  it('sans lecteur RevenueCat, reste à blanc et le dit', async () => {
    const fake = fakePurgePorts({ candidates: ALL, revenuecat: false })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report).toMatchObject({
      mode: 'apply',
      revenuecat: 'absent',
      due: ALL_DUE,
      done: ZERO_DONE,
    })
    expect(fake.calls.map((c) => c.kind)).toEqual(['list'])
  })

  it('clé RevenueCat mal saisie en mode appliquer : refus, jamais une passe à blanc', async () => {
    const fake = fakePurgePorts({
      candidates: ALL,
      revenuecat: false,
      invalidProviderSettings: ['REVENUECAT_SECRET_KEY'],
    })

    await expect(runPurgePass(fake.ports, 'apply')).rejects.toBeInstanceOf(
      ErasureNotConfiguredError,
    )
    expect(fake.calls).toEqual([])
  })

  it('Léa, abonnée chez RevenueCat sans ligne en base : jamais avertie ni supprimée', async () => {
    const lea = candidate('aaaaaaaa-0000-4000-8000-000000000020', {
      createdAt: '2026-12-01T10:00:00.000Z',
    })
    const warnedLea = candidate('aaaaaaaa-0000-4000-8000-000000000021', {
      createdAt: '2026-12-01T10:00:00.000Z',
      notice: {
        purgeOn: '2027-11-19',
        warnedAt: '2027-10-19T03:00:00.000Z',
        revenuecatErasedAt: null,
      },
    })
    const fake = fakePurgePorts({
      candidates: [lea, warnedLea],
      subscribers: { [lea.userId]: ACTIVE_UNTIL_2028, [warnedLea.userId]: ACTIVE_UNTIL_2028 },
    })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.skipped.reactivated).toBe(2)
    expect(fake.sent).toEqual([])
    expect(fake.calls.map((c) => c.kind)).not.toContain('deleteUser')
    expect(fake.calls.map((c) => c.kind)).not.toContain('revenuecat-erase')
  })

  it('compte sans ligne en base que RevenueCat connaît comme ancien abonné : attend 11 mois après sa fin', async () => {
    const ended = {
      entitlements: {
        plus: { expires_date: '2027-01-01T00:00:00Z', product_identifier: 'plus:annual' },
      },
    }
    const fake = fakePurgePorts({
      candidates: [NEVER_BOUGHT],
      subscribers: { [NEVER_BOUGHT.userId]: ended },
    })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.skipped).toEqual({ ...ZERO_SKIPPED, laterEnd: 1 })
    expect(fake.sent).toEqual([])
    expect(fake.calls.map((c) => c.kind)).not.toContain('revenuecat-erase')
  })

  it('pause Google Play : le client RevenueCat n’est pas effacé tant que la reprise est à venir', async () => {
    useClock('2027-01-30T03:00:00.000Z')
    const paused = candidate('aaaaaaaa-0000-4000-8000-000000000022', {
      plus: { expiresAt: '2026-12-01T00:00:00.000Z' },
    })
    const subscriber = {
      entitlements: {
        plus: { expires_date: '2026-12-01T00:00:00Z', product_identifier: 'plus:monthly' },
      },
      subscriptions: { 'plus:monthly': { auto_resume_date: '2027-03-01T00:00:00Z' } },
    }
    const fake = fakePurgePorts({
      candidates: [paused],
      subscribers: { [paused.userId]: subscriber },
    })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.due.revenuecatErasures).toBe(1)
    expect(report.skipped.reactivated).toBe(1)
    expect(fake.calls.map((c) => c.kind)).not.toContain('revenuecat-erase')
  })
})

describe('runPurgePass : webhook d’achat perdu, fin d’accès connue de RevenueCat seul', () => {
  const LEO_ID = 'aaaaaaaa-0000-4000-8000-000000000030'
  const LEO_CREATED = '2026-12-01T10:00:00.000Z'
  const LEO = candidate(LEO_ID, { createdAt: LEO_CREATED })
  const LEO_ENDED = {
    entitlements: {
      plus: {
        expires_date: '2027-01-02T00:00:00Z',
        product_identifier: 'plus:monthly',
        purchase_date: '2026-12-02T00:00:00Z',
      },
    },
  }
  const WARNING_DAY = '2027-12-02T03:00:00.000Z'

  function warnedLeo(notice: { purgeOn: string | null; warnedAt: string | null }) {
    return candidate(LEO_ID, {
      createdAt: LEO_CREATED,
      notice: { ...notice, revenuecatErasedAt: null },
    })
  }

  async function warnLeo() {
    useClock(WARNING_DAY)
    const fake = fakePurgePorts({ candidates: [LEO], subscribers: { [LEO_ID]: LEO_ENDED } })
    const report = await runPurgePass(fake.ports, 'apply')
    return { fake, report, notice: fake.notices[LEO_ID]! }
  }

  it('Léo, 11 mois après sa création mais pas après la fin de son accès : sauté, rien d’effacé', async () => {
    useClock('2027-11-02T03:00:00.000Z')
    const fake = fakePurgePorts({ candidates: [LEO], subscribers: { [LEO_ID]: LEO_ENDED } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.due.warnings).toBe(1)
    expect(report.done).toEqual(ZERO_DONE)
    expect(report.skipped).toEqual({ ...ZERO_SKIPPED, laterEnd: 1 })
    expect(fake.calls.map((c) => c.kind)).toEqual(['list', 'read', 'revenuecat-read'])
    expect(fake.notices).toEqual({})
  })

  it('Léo, la veille des 11 mois après la fin de son accès : toujours sauté', async () => {
    useClock('2027-12-01T23:59:59.999Z')
    const fake = fakePurgePorts({ candidates: [LEO], subscribers: { [LEO_ID]: LEO_ENDED } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.skipped.laterEnd).toBe(1)
    expect(fake.sent).toEqual([])
  })

  it('Léo, 11 mois après la fin connue de RevenueCat : averti avec la vraie fin, puis RevenueCat effacé', async () => {
    const { fake, report, notice } = await warnLeo()

    expect(report.done).toEqual({ ...ZERO_DONE, warnings: 1 })
    expect(fake.sent[0]?.text).toContain('a pris fin le 2 janvier 2027.')
    expect(fake.sent[0]?.subject).toBe('Votre compte MémoPatte sera supprimé le 2 janvier 2028')
    expect(notice).toEqual({
      inactiveSince: LEO_CREATED,
      purgeOn: '2028-01-02',
      warnedAt: WARNING_DAY,
      revenuecatErasedAt: null,
    })
    expect(fake.calls.map((c) => c.kind)).toEqual([
      'list',
      'read',
      'revenuecat-read',
      'send',
      'save',
      'revenuecat-erase',
    ])
  })

  it.each([
    ['RevenueCat effacé', {}],
    ['RevenueCat pas encore effacé', LEO_ENDED],
  ])('deuxième passe le jour de l’avertissement (%s) : aucun second e-mail', async (_, rc) => {
    const { notice } = await warnLeo()
    const fake = fakePurgePorts({ candidates: [warnedLeo(notice)], subscribers: { [LEO_ID]: rc } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(fake.sent).toEqual([])
    expect(report.done).toEqual(ZERO_DONE)
    expect(fake.calls.map((c) => c.kind)).not.toContain('deleteUser')
  })

  it.each([
    ['RevenueCat effacé', {}],
    ['RevenueCat pas encore effacé', LEO_ENDED],
  ])('Léo averti : supprimé le lendemain de J, jamais le jour J (%s)', async (_, rc) => {
    const { notice } = await warnLeo()
    const warned = warnedLeo(notice)

    useClock('2028-01-02T23:59:59.999Z')
    const early = fakePurgePorts({ candidates: [warned], subscribers: { [LEO_ID]: rc } })
    await runPurgePass(early.ports, 'apply')
    expect(early.calls.map((c) => c.kind)).not.toContain('deleteUser')

    useClock('2028-01-03T03:00:00.000Z')
    const due = fakePurgePorts({ candidates: [warned], subscribers: { [LEO_ID]: rc } })
    const report = await runPurgePass(due.ports, 'apply')
    expect(report.done.deletions).toBe(1)
    expect(due.calls.find((c) => c.kind === 'deleteUser')?.userId).toBe(LEO_ID)
    expect(due.sent).toEqual([])
  })

  it('averti avant un achat dont le webhook s’est perdu : l’ancien avis ne fait rien supprimer', async () => {
    const before = warnedLeo({ purgeOn: '2027-11-19', warnedAt: '2027-10-19T03:00:00.000Z' })
    const boughtAfter = {
      entitlements: {
        plus: { expires_date: '2027-11-15T00:00:00Z', product_identifier: 'plus:monthly' },
      },
    }
    const fake = fakePurgePorts({ candidates: [before], subscribers: { [LEO_ID]: boughtAfter } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.due.deletions).toBe(1)
    expect(report.skipped.laterEnd).toBe(1)
    expect(fake.calls.map((c) => c.kind)).not.toContain('deleteUser')
    expect(fake.calls.map((c) => c.kind)).not.toContain('revenuecat-erase')
    expect(fake.sent).toEqual([])
  })

  it('Mia, avertie depuis sa création, puis RevenueCat connaît une fin plus tardive : pas supprimée avant 12 mois après cette fin', async () => {
    const miaId = 'aaaaaaaa-0000-4000-8000-000000000031'
    const created = '2026-01-01T10:00:00.000Z'
    const ended = {
      entitlements: {
        plus: { expires_date: '2026-11-01T00:00:00Z', product_identifier: 'plus:monthly' },
      },
    }
    const warnedFromCreation = candidate(miaId, {
      createdAt: created,
      notice: {
        purgeOn: '2027-01-02',
        warnedAt: '2026-12-01T10:00:00.000Z',
        revenuecatErasedAt: null,
      },
    })

    useClock('2027-01-03T03:00:00.000Z')
    const early = fakePurgePorts({
      candidates: [warnedFromCreation],
      subscribers: { [miaId]: ended },
    })
    const earlyReport = await runPurgePass(early.ports, 'apply')
    expect(earlyReport.due.deletions).toBe(1)
    expect(earlyReport.skipped).toEqual({ ...ZERO_SKIPPED, laterEnd: 1 })
    expect(early.calls.map((c) => c.kind)).not.toContain('deleteUser')

    useClock('2027-10-01T03:00:00.000Z')
    const warning = fakePurgePorts({
      candidates: [warnedFromCreation],
      subscribers: { [miaId]: ended },
    })
    await runPurgePass(warning.ports, 'apply')
    expect(warning.calls.map((c) => c.kind)).not.toContain('deleteUser')
    expect(warning.sent[0]?.text).toContain('a pris fin le 1er novembre 2026.')
    const notice = warning.notices[miaId]!
    expect(notice).toMatchObject({ inactiveSince: created, purgeOn: '2027-11-01' })

    useClock('2027-11-02T03:00:00.000Z')
    const due = fakePurgePorts({
      candidates: [candidate(miaId, { createdAt: created, notice })],
      subscribers: { [miaId]: ended },
    })
    const dueReport = await runPurgePass(due.ports, 'apply')
    expect(dueReport.done.deletions).toBe(1)
    expect(due.sent).toEqual([])
  })

  it.each([
    [
      'accès en cours',
      {
        entitlements: {
          plus: { expires_date: '2028-02-01T00:00:00Z', product_identifier: 'plus:annual' },
        },
      },
    ],
    [
      'achat à vie',
      { entitlements: { plus: { expires_date: null, product_identifier: 'plus_lifetime' } } },
    ],
    [
      'pause à venir',
      {
        entitlements: {
          plus: { expires_date: '2027-01-02T00:00:00Z', product_identifier: 'plus:monthly' },
        },
        subscriptions: { 'plus:monthly': { auto_resume_date: '2028-02-01T00:00:00Z' } },
      },
    ],
    [
      'fin illisible',
      {
        entitlements: {
          plus: { expires_date: 'pas une date', product_identifier: 'plus:monthly' },
        },
      },
    ],
  ])('sans ligne en base, RevenueCat montre %s : ni averti ni supprimé', async (_, rc) => {
    useClock(WARNING_DAY)
    const warned = warnedLeo({ purgeOn: '2027-11-19', warnedAt: '2027-10-19T03:00:00.000Z' })
    const fake = fakePurgePorts({ candidates: [LEO], subscribers: { [LEO_ID]: rc } })
    const due = fakePurgePorts({ candidates: [warned], subscribers: { [LEO_ID]: rc } })

    const reports = [
      await runPurgePass(fake.ports, 'apply'),
      await runPurgePass(due.ports, 'apply'),
    ]

    for (const report of reports) {
      expect(report.skipped).toEqual({ ...ZERO_SKIPPED, reactivated: 1 })
      expect(report.done).toEqual(ZERO_DONE)
    }
    for (const { calls, sent } of [fake, due]) {
      expect(sent).toEqual([])
      expect(calls.map((c) => c.kind)).not.toContain('deleteUser')
      expect(calls.map((c) => c.kind)).not.toContain('revenuecat-erase')
    }
  })

  it('lecture RevenueCat en échec : ni averti ni supprimé, repris à la passe suivante', async () => {
    useClock(WARNING_DAY)
    const warned = warnedLeo({ purgeOn: '2027-11-19', warnedAt: '2027-10-19T03:00:00.000Z' })
    const failing = fakePurgePorts({
      candidates: [LEO, warned],
      subscribers: { [LEO_ID]: LEO_ENDED },
      failOn: { kind: 'revenuecat-read' },
    })

    const report = await runPurgePass(failing.ports, 'apply')

    expect(report.failures).toEqual({ ...ZERO_FAILURES, revenuecat: 2 })
    expect(report.done).toEqual(ZERO_DONE)
    expect(failing.sent).toEqual([])
    expect(failing.notices).toEqual({})
    expect(failing.calls.map((c) => c.kind)).not.toContain('deleteUser')

    const nextDay = fakePurgePorts({ candidates: [LEO], subscribers: { [LEO_ID]: LEO_ENDED } })
    expect((await runPurgePass(nextDay.ports, 'apply')).done.warnings).toBe(1)
  })

  it('effacement RevenueCat en échec après l’avertissement : l’avis reste, aucun second e-mail', async () => {
    useClock(WARNING_DAY)
    const fake = fakePurgePorts({
      candidates: [LEO],
      subscribers: { [LEO_ID]: LEO_ENDED },
      failOn: { kind: 'revenuecat-erase' },
    })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.failures.revenuecat).toBe(1)
    expect(fake.sent).toHaveLength(1)
    expect(fake.notices[LEO_ID]?.purgeOn).toBe('2028-01-02')
  })
})

describe('runPurgePass : limites et échecs', () => {
  it(`supprime au plus ${MAX_DELETIONS_PER_PASS} comptes par passe`, async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      candidate(`bbbbbbbb-0000-4000-8000-${String(index).padStart(12, '0')}`, DELETE.dates),
    )
    const fake = fakePurgePorts({ candidates: many })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(MAX_DELETIONS_PER_PASS).toBe(10)
    expect(fake.calls.filter((c) => c.kind === 'deleteUser')).toHaveLength(10)
    expect(report.skipped.batchFull).toBe(2)
  })

  it('compte les tentatives : une panne de suppression n’efface pas plus de 10 comptes chez les prestataires', async () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      candidate(`cccccccc-0000-4000-8000-${String(index).padStart(12, '0')}`, DELETE.dates),
    )
    const fake = fakePurgePorts({ candidates: many, failOn: { kind: 'deleteUser' } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(fake.calls.filter((c) => c.kind === 'posthog')).toHaveLength(10)
    expect(report.failures.deletion).toBe(10)
    expect(report.skipped.batchFull).toBe(2)
  })

  it('compte les échecs par prestataire et continue avec les comptes suivants', async () => {
    const fake = fakePurgePorts({
      candidates: ALL,
      failOn: { kind: 'deleteUser', userId: DELETE.userId },
    })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.failures).toEqual({ ...ZERO_FAILURES, deletion: 1 })
    expect(report.done).toEqual({
      warnings: 2,
      deletions: 0,
      revenuecatErasures: 1,
      unconfirmedDeletions: 1,
    })
  })

  it.each([
    ['read', 'database'],
    ['revenuecat-read', 'revenuecat'],
    ['revenuecat-erase', 'revenuecat'],
  ] as const)(
    'un échec de %s se compte en %s, sans action sur le compte',
    async (kind, failure) => {
      const fake = fakePurgePorts({ candidates: [REVENUECAT], failOn: { kind } })

      const report = await runPurgePass(fake.ports, 'apply')

      expect(report.failures[failure]).toBe(1)
      expect(fake.notices).toEqual({})
    },
  )

  it('un avis non enregistré après l’envoi se compte en échec de base', async () => {
    const fake = fakePurgePorts({ candidates: [WARN], failOn: { kind: 'save' } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.failures.database).toBe(1)
    expect(report.done.warnings).toBe(0)
  })

  it('refuse d’appliquer quand les réglages des prestataires sont invalides', async () => {
    const fake = fakePurgePorts({
      candidates: ALL,
      invalidProviderSettings: ['REVENUECAT_SECRET_KEY'],
    })

    await expect(runPurgePass(fake.ports, 'apply')).rejects.toBeInstanceOf(
      ErasureNotConfiguredError,
    )
    expect(fake.calls).toEqual([])
  })

  it('ne journalise ni identifiant ni adresse, même en échec', async () => {
    const lines: unknown[] = []
    for (const level of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, level).mockImplementation((...args) => lines.push(...args))
    }
    const fake = fakePurgePorts({
      candidates: ALL,
      failOn: { kind: 'deleteUser', userId: DELETE.userId },
    })

    const report = await runPurgePass(fake.ports, 'apply')

    const written = JSON.stringify([lines.map(String), report])
    for (const account of ALL) {
      expect(written).not.toContain(account.userId)
      expect(written).not.toContain(account.email)
    }
    expect(written).not.toContain('@')
  })
})
