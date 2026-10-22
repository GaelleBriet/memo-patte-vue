import { describe, expect, it, vi } from 'vitest'

import { NO_PLUS, type PlusStatus } from '../logic/plus-status'
import type { PaidPlan } from '../service/billing.service'
import {
  createCheckout,
  type CheckoutAccount,
  type CheckoutPort,
} from '../service/checkout.service'

const USER_ID = '4d1c6a52-8f0e-4b8e-9a51-2f6a3c9d7e10'
const ANNUEL: PlusStatus = { plan: 'annual', expiresAt: '2027-10-22T10:00:00Z' }

function compte(
  userId: string | null,
  {
    session = true,
    refreshed = false,
    refused = true,
  }: { session?: boolean; refreshed?: boolean; refused?: boolean } = {},
): CheckoutAccount {
  return {
    accountId: () => userId,
    hasSession: () => session,
    refreshSession: vi.fn<CheckoutAccount['refreshSession']>(async () => refreshed),
    sessionRefused: () => refused,
  }
}

function port(overrides: Partial<CheckoutPort> = {}) {
  let pending: PaidPlan | null = null
  let pendingRestore = false
  const calls: string[] = []
  const value: CheckoutPort = {
    status: NO_PLUS,
    logIn: vi.fn<CheckoutPort['logIn']>(async (appUserID) => {
      calls.push(`logIn:${appUserID}`)
      return NO_PLUS
    }),
    purchase: vi.fn<CheckoutPort['purchase']>(async (plan) => {
      calls.push(`purchase:${plan}`)
      return { kind: 'purchased', status: ANNUEL }
    }),
    rememberCheckout: vi.fn<CheckoutPort['rememberCheckout']>((plan) => {
      pending = plan
    }),
    takePendingCheckout: vi.fn<CheckoutPort['takePendingCheckout']>(() => {
      const plan = pending
      pending = null
      return plan
    }),
    restore: vi.fn<CheckoutPort['restore']>(async () => {
      calls.push('restore')
      return ANNUEL
    }),
    rememberRestore: vi.fn<CheckoutPort['rememberRestore']>(() => {
      pendingRestore = true
    }),
    takePendingRestore: vi.fn<CheckoutPort['takePendingRestore']>(() => {
      const asked = pendingRestore
      pendingRestore = false
      return asked
    }),
    ...overrides,
  }
  return { value, calls }
}

describe('checkout', () => {
  it('sans compte, retient l’offre et ne contacte pas Google Play', async () => {
    const { value } = port()
    const { checkout, resume } = createCheckout(compte(null), () => value)

    await expect(checkout('annual')).resolves.toEqual({ kind: 'needs-account' })

    expect(value.logIn).not.toHaveBeenCalled()
    expect(value.purchase).not.toHaveBeenCalled()
    expect(resume()).toEqual({ plan: 'annual', pay: false })
  })

  it('avec un compte, rattache l’achat au compte avant de payer', async () => {
    const { value, calls } = port()
    const { checkout } = createCheckout(compte(USER_ID), () => value)

    await expect(checkout('lifetime')).resolves.toEqual({ kind: 'purchased', status: ANNUEL })

    expect(calls).toEqual([`logIn:${USER_ID}`, 'purchase:lifetime'])
  })

  it('ne paie pas quand le compte n’a pas pu être rattaché', async () => {
    const { value } = port({
      logIn: vi.fn<CheckoutPort['logIn']>(async () => Promise.reject(new Error('réseau'))),
    })
    const { checkout } = createCheckout(compte(USER_ID), () => value)

    await expect(checkout('annual')).rejects.toThrow('réseau')

    expect(value.purchase).not.toHaveBeenCalled()
  })

  it('ne fait pas payer deux fois un compte qui a déjà Plus', async () => {
    const { value } = port({ logIn: vi.fn<CheckoutPort['logIn']>(async () => ANNUEL) })
    const { checkout } = createCheckout(compte(USER_ID), () => value)

    await expect(checkout('monthly')).resolves.toEqual({ kind: 'already-plus' })

    expect(value.purchase).not.toHaveBeenCalled()
  })

  it('rend l’annulation de Google Play telle quelle', async () => {
    const { value } = port({
      purchase: vi.fn<CheckoutPort['purchase']>(async () => ({ kind: 'cancelled' })),
    })
    const { checkout } = createCheckout(compte(USER_ID), () => value)

    await expect(checkout('annual')).resolves.toEqual({ kind: 'cancelled' })
  })
})

describe('checkout — session', () => {
  it('sans session active ni rafraîchie, ne rattache rien, ne paie pas et demande la connexion', async () => {
    const { value } = port()
    const account = compte(USER_ID, { session: false, refreshed: false })
    const { checkout, resume } = createCheckout(account, () => value)

    await expect(checkout('annual')).resolves.toEqual({ kind: 'needs-sign-in' })

    expect(account.refreshSession).toHaveBeenCalledTimes(1)
    expect(value.logIn).not.toHaveBeenCalled()
    expect(value.purchase).not.toHaveBeenCalled()
    expect(resume()).toEqual({ plan: 'annual', pay: false })
  })

  it('hors ligne, ne rattache rien, ne paie pas et reste sur l’écran Plus', async () => {
    const { value } = port()
    const { checkout, resume } = createCheckout(
      compte(USER_ID, { session: false, refreshed: false, refused: false }),
      () => value,
    )

    await expect(checkout('annual')).resolves.toEqual({ kind: 'offline' })

    expect(value.logIn).not.toHaveBeenCalled()
    expect(value.purchase).not.toHaveBeenCalled()
    expect(resume()).toBeNull()
  })

  it('paie une fois la session rafraîchie avec succès', async () => {
    const { value, calls } = port()
    const { checkout } = createCheckout(
      compte(USER_ID, { session: false, refreshed: true }),
      () => value,
    )

    await expect(checkout('monthly')).resolves.toEqual({ kind: 'purchased', status: ANNUEL })

    expect(calls).toEqual([`logIn:${USER_ID}`, 'purchase:monthly'])
  })

  it('paie quand la session s’est rétablie pendant un rafraîchissement donné perdant', async () => {
    let session = false
    const { value, calls } = port()
    const { checkout } = createCheckout(
      {
        accountId: () => USER_ID,
        hasSession: () => session,
        refreshSession: vi.fn<CheckoutAccount['refreshSession']>(async () => {
          session = true
          return false
        }),
        sessionRefused: () => false,
      },
      () => value,
    )

    await expect(checkout('annual')).resolves.toEqual({ kind: 'purchased', status: ANNUEL })

    expect(calls).toEqual([`logIn:${USER_ID}`, 'purchase:annual'])
  })

  it('ne rafraîchit pas une session déjà active', async () => {
    const { value } = port()
    const account = compte(USER_ID)
    const { checkout } = createCheckout(account, () => value)

    await checkout('annual')

    expect(account.refreshSession).not.toHaveBeenCalled()
  })
})

describe('resume', () => {
  it('ne relance pas le paiement tant que la session n’est pas active', () => {
    let session = false
    const { value } = port()
    const { resume } = createCheckout(
      { ...compte(USER_ID), hasSession: () => session },
      () => value,
    )

    value.rememberCheckout('annual')
    expect(resume()).toEqual({ plan: 'annual', pay: false })

    session = true
    value.rememberCheckout('annual')
    expect(resume()).toEqual({ plan: 'annual', pay: true })
  })

  it('ne reprend rien quand aucune offre n’attend', () => {
    const { value } = port()
    const { resume } = createCheckout(compte(USER_ID), () => value)

    expect(resume()).toBeNull()
  })

  it('relance le paiement de l’offre retenue une fois le compte ouvert', async () => {
    let account: string | null = null
    const { value } = port()
    const { checkout, resume } = createCheckout(
      { ...compte(null), accountId: () => account },
      () => value,
    )
    await checkout('lifetime')

    account = USER_ID

    expect(resume()).toEqual({ plan: 'lifetime', pay: true })
  })

  it('ne reprend l’offre retenue qu’une fois', async () => {
    const { value } = port()
    const { checkout, resume } = createCheckout(compte(null), () => value)
    await checkout('monthly')

    resume()

    expect(resume()).toBeNull()
  })

  it('ne relance pas le paiement quand le compte s’avère déjà dans Plus', async () => {
    let account: string | null = null
    const { value } = port()
    const { checkout, resume } = createCheckout(
      { ...compte(null), accountId: () => account },
      () => value,
    )
    await checkout('annual')

    account = USER_ID
    value.status = ANNUEL

    expect(resume()).toEqual({ plan: 'annual', pay: false })
  })
})

describe('restorePurchases', () => {
  it('sans compte, retient la demande et ne contacte pas Google Play', async () => {
    const { value } = port()
    const { restorePurchases } = createCheckout(compte(null), () => value)

    await expect(restorePurchases()).resolves.toEqual({ kind: 'needs-account' })

    expect(value.logIn).not.toHaveBeenCalled()
    expect(value.restore).not.toHaveBeenCalled()
    expect(value.takePendingRestore()).toBe(true)
  })

  it('avec un compte, le donne à RevenueCat avant de restaurer, jamais sur un identifiant anonyme', async () => {
    const { value, calls } = port()
    const { restorePurchases } = createCheckout(compte(USER_ID), () => value)

    await expect(restorePurchases()).resolves.toEqual({ kind: 'restored', status: ANNUEL })

    expect(calls).toEqual([`logIn:${USER_ID}`, 'restore'])
  })

  it('ne restaure pas quand le compte n’a pas pu être donné à RevenueCat', async () => {
    const { value } = port({
      logIn: vi.fn<CheckoutPort['logIn']>(async () => Promise.reject(new Error('réseau'))),
    })
    const { restorePurchases } = createCheckout(compte(USER_ID), () => value)

    await expect(restorePurchases()).rejects.toThrow('réseau')

    expect(value.restore).not.toHaveBeenCalled()
  })

  it('rend le droit du compte sans redemander à Google Play quand il en a déjà un', async () => {
    const { value } = port({ logIn: vi.fn<CheckoutPort['logIn']>(async () => ANNUEL) })
    const { restorePurchases } = createCheckout(compte(USER_ID), () => value)

    await expect(restorePurchases()).resolves.toEqual({ kind: 'restored', status: ANNUEL })

    expect(value.restore).not.toHaveBeenCalled()
  })

  it('session refusée par le serveur : retient la demande et passe par la connexion', async () => {
    const { value } = port()
    const { restorePurchases } = createCheckout(
      compte(USER_ID, { session: false, refused: true }),
      () => value,
    )

    await expect(restorePurchases()).resolves.toEqual({ kind: 'needs-sign-in' })

    expect(value.logIn).not.toHaveBeenCalled()
    expect(value.restore).not.toHaveBeenCalled()
    expect(value.takePendingRestore()).toBe(true)
  })

  it('hors ligne : rien n’est retenu, rien n’est restauré', async () => {
    const { value } = port()
    const { restorePurchases } = createCheckout(
      compte(USER_ID, { session: false, refused: false }),
      () => value,
    )

    await expect(restorePurchases()).resolves.toEqual({ kind: 'offline' })

    expect(value.logIn).not.toHaveBeenCalled()
    expect(value.restore).not.toHaveBeenCalled()
    expect(value.takePendingRestore()).toBe(false)
  })

  it('restaure une fois la session rafraîchie avec succès', async () => {
    const { value, calls } = port()
    const { restorePurchases } = createCheckout(
      compte(USER_ID, { session: false, refreshed: true }),
      () => value,
    )

    await restorePurchases()

    expect(calls).toEqual([`logIn:${USER_ID}`, 'restore'])
  })
})

describe('resumeRestore', () => {
  it('ne reprend rien quand aucune demande n’attend', () => {
    const { value } = port()

    expect(createCheckout(compte(USER_ID), () => value).resumeRestore()).toBe(false)
  })

  it('reprend la demande une seule fois, et seulement connecté avec une session active', () => {
    let session = false
    const { value } = port()
    const { resumeRestore } = createCheckout(
      { ...compte(USER_ID), hasSession: () => session },
      () => value,
    )

    value.rememberRestore()
    expect(resumeRestore()).toBe(false)
    expect(resumeRestore()).toBe(false)

    session = true
    value.rememberRestore()
    expect(resumeRestore()).toBe(true)
    expect(resumeRestore()).toBe(false)
  })
})
