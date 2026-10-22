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
  { session = true, refreshed = false }: { session?: boolean; refreshed?: boolean } = {},
): CheckoutAccount {
  return {
    accountId: () => userId,
    hasSession: () => session,
    refreshSession: vi.fn<CheckoutAccount['refreshSession']>(async () => refreshed),
  }
}

function port(overrides: Partial<CheckoutPort> = {}) {
  let pending: PaidPlan | null = null
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

  it('paie une fois la session rafraîchie avec succès', async () => {
    const { value, calls } = port()
    const { checkout } = createCheckout(
      compte(USER_ID, { session: false, refreshed: true }),
      () => value,
    )

    await expect(checkout('monthly')).resolves.toEqual({ kind: 'purchased', status: ANNUEL })

    expect(calls).toEqual([`logIn:${USER_ID}`, 'purchase:monthly'])
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
