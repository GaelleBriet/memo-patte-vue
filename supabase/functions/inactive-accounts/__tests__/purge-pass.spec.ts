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

const ZERO_DONE = { warnings: 0, deletions: 0, revenuecatErasures: 0 }
const ZERO_DUE = { warnings: 0, deletions: 0, revenuecatErasures: 0, unconfirmedPending: 0 }
const ZERO_SKIPPED = { reactivated: 0, batchFull: 0 }
const ZERO_FAILURES = { database: 0, revenuecat: 0, email: 0, deletion: 0 }
const ALL_DUE = { warnings: 2, deletions: 1, revenuecatErasures: 1, unconfirmedPending: 1 }
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
      done: { warnings: 2, deletions: 1, revenuecatErasures: 1 },
      skipped: ZERO_SKIPPED,
      failures: ZERO_FAILURES,
    })
    expect(fake.calls.filter((c) => c.kind === 'deleteUser').map((c) => c.userId)).toEqual([
      DELETE.userId,
    ])
    expect(fake.calls.filter((c) => c.kind === 'record').map((c) => c.arg)).toEqual(['inactivity'])
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

  it('n’avertit ni ne supprime une adresse jamais confirmée, en attente de la décision de Gaelle', async () => {
    const plusEnded = candidate('aaaaaaaa-0000-4000-8000-000000000012', {
      createdAt: '2025-01-01T08:00:00.000Z',
      emailConfirmed: false,
      plus: { expiresAt: '2026-01-01T00:00:00.000Z' },
    })
    const fake = fakePurgePorts({ candidates: [UNCONFIRMED, plusEnded] })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.due).toEqual({ ...ZERO_DUE, unconfirmedPending: 2 })
    expect(report.done).toEqual(ZERO_DONE)
    expect(fake.sent).toEqual([])
    expect(fake.calls.map((c) => c.kind)).toEqual(['list'])
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

    expect(report.done).toEqual({ warnings: 1, deletions: 0, revenuecatErasures: 0 })
    expect(fake.calls.map((c) => c.kind)).not.toContain('deleteUser')
  })

  it('un avertissement qui n’est pas parti ne laisse aucun avis, donc aucune suppression', async () => {
    const fake = fakePurgePorts({ candidates: [WARN], failOn: { kind: 'send' } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.failures.email).toBe(1)
    expect(fake.notices).toEqual({})
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

  it('n’agit pas quand RevenueCat connaît une fin d’accès plus récente que la base', async () => {
    const later = {
      entitlements: {
        plus: { expires_date: '2027-06-01T00:00:00Z', product_identifier: 'plus:annual' },
      },
    }
    const fake = fakePurgePorts({ candidates: [WARN], subscribers: { [WARN.userId]: later } })

    const report = await runPurgePass(fake.ports, 'apply')

    expect(report.skipped.reactivated).toBe(1)
    expect(fake.sent).toEqual([])
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

  it('n’agit pas sur un compte sans ligne en base que RevenueCat connaît comme ancien abonné', async () => {
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

    expect(report.skipped.reactivated).toBe(1)
    expect(fake.sent).toEqual([])
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
    expect(report.done).toEqual({ warnings: 2, deletions: 0, revenuecatErasures: 1 })
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
