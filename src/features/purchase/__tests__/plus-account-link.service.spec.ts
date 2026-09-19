// @vitest-environment node
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { BillingError } from '../service/billing.service'
import {
  createPlusAccountLink,
  installPlusAccountLink,
  type PlusAccountPort,
} from '../service/plus-account-link.service'

const ALICE = '0f8fad5b-d9cb-469f-a165-70867728950e'
const BOB = '7c9e6679-7425-40de-944b-e07fc1f90ae7'

function fakePurchase(available = true) {
  return {
    available,
    logIn: vi.fn<PlusAccountPort['logIn']>().mockResolvedValue(undefined),
    logOut: vi.fn<PlusAccountPort['logOut']>().mockResolvedValue(undefined),
  }
}

beforeEach(() => {
  vi.restoreAllMocks()
})

describe('createPlusAccountLink', () => {
  it('rattache l’achat à l’identifiant du compte', async () => {
    const purchase = fakePurchase()

    await createPlusAccountLink(() => purchase).linkToAccount(ALICE)

    expect(purchase.logIn).toHaveBeenCalledExactlyOnceWith(ALICE)
  })

  it('détache l’achat à la déconnexion', async () => {
    const purchase = fakePurchase()

    await createPlusAccountLink(() => purchase).unlinkFromAccount()

    expect(purchase.logOut).toHaveBeenCalledOnce()
  })

  it('reste sans effet quand les achats sont indisponibles', async () => {
    const purchase = fakePurchase(false)
    const link = createPlusAccountLink(() => purchase)

    await link.linkToAccount(ALICE)
    await link.unlinkFromAccount()

    expect(purchase.logIn).not.toHaveBeenCalled()
    expect(purchase.logOut).not.toHaveBeenCalled()
  })

  it('ne fait échouer ni une connexion ni une déconnexion quand le store ne répond pas', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const purchase = fakePurchase()
    purchase.logIn.mockRejectedValue(new BillingError('failed'))
    purchase.logOut.mockRejectedValue(new BillingError('failed'))
    const link = createPlusAccountLink(() => purchase)

    await expect(link.linkToAccount(ALICE)).resolves.toBeUndefined()
    await expect(link.unlinkFromAccount()).resolves.toBeUndefined()

    expect(warn).toHaveBeenCalledTimes(2)
  })
})

describe('installPlusAccountLink', () => {
  function installed() {
    const accountId = ref<string | null>(null)
    const link = {
      linkToAccount: vi.fn<(userId: string) => Promise<void>>().mockResolvedValue(),
      unlinkFromAccount: vi.fn<() => Promise<void>>().mockResolvedValue(),
    }
    const stop = installPlusAccountLink(() => accountId.value, link)
    return { accountId, link, stop }
  }

  it('rattache à la connexion', async () => {
    const { accountId, link } = installed()

    accountId.value = ALICE
    await nextTick()

    expect(link.linkToAccount).toHaveBeenCalledExactlyOnceWith(ALICE)
    expect(link.unlinkFromAccount).not.toHaveBeenCalled()
  })

  it('détache à la déconnexion', async () => {
    const { accountId, link } = installed()
    accountId.value = ALICE
    await nextTick()

    accountId.value = null
    await nextTick()

    expect(link.unlinkFromAccount).toHaveBeenCalledOnce()
  })

  it('rattache au nouveau compte quand un autre prend la main sur l’appareil', async () => {
    const { accountId, link } = installed()
    accountId.value = ALICE
    await nextTick()

    accountId.value = BOB
    await nextTick()

    expect(link.linkToAccount.mock.calls).toEqual([[ALICE], [BOB]])
    expect(link.unlinkFromAccount).not.toHaveBeenCalled()
  })

  it('ne rattache rien tant que le compte connu ne change pas', async () => {
    const { accountId, link } = installed()

    accountId.value = null
    await nextTick()

    expect(link.linkToAccount).not.toHaveBeenCalled()
    expect(link.unlinkFromAccount).not.toHaveBeenCalled()
  })

  it('s’arrête sur demande', async () => {
    const { accountId, link, stop } = installed()

    stop()
    accountId.value = ALICE
    await nextTick()

    expect(link.linkToAccount).not.toHaveBeenCalled()
  })
})
