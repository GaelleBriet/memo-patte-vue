import type { PaidPlan, PlusOffer } from '../service/billing.service'
import type { CheckoutOutcome } from '../service/checkout.service'

export type PlusBenefit = 'backup' | 'devices' | 'photos'

export type CheckoutNext = 'account' | 'success' | 'cancelled' | 'offers'

export type CheckoutBar =
  | { kind: 'offer'; offer: PlusOffer }
  | { kind: 'connecting' }
  | { kind: 'unavailable'; retrying: boolean }

export const PLUS_BENEFITS: readonly PlusBenefit[] = ['backup', 'devices', 'photos']

const OFFER_ORDER: readonly PaidPlan[] = ['annual', 'monthly', 'lifetime']

export const PRESELECTED_PLAN: PaidPlan = 'annual'

export function orderedOffers(offers: readonly PlusOffer[]): PlusOffer[] {
  return OFFER_ORDER.flatMap((plan) => offers.filter((offer) => offer.plan === plan))
}

export function selectablePlan(offers: readonly PlusOffer[], selected: PaidPlan): PaidPlan {
  if (offers.some((offer) => offer.plan === selected)) return selected
  return offers[0]?.plan ?? PRESELECTED_PLAN
}

export function checkoutBar(state: {
  offers: readonly PlusOffer[]
  selected: PaidPlan
  loading: boolean
  answered: boolean
}): CheckoutBar {
  const plan = selectablePlan(state.offers, state.selected)
  const offer = state.offers.find((candidate) => candidate.plan === plan)
  if (offer) return { kind: 'offer', offer }
  if (state.loading && !state.answered) return { kind: 'connecting' }
  return { kind: 'unavailable', retrying: state.loading }
}

const CHECKOUT_NEXT: Record<CheckoutOutcome['kind'], CheckoutNext> = {
  'needs-account': 'account',
  purchased: 'success',
  cancelled: 'cancelled',
  'already-plus': 'offers',
}

export function nextAfterCheckout(outcome: CheckoutOutcome): CheckoutNext {
  return CHECKOUT_NEXT[outcome.kind]
}
