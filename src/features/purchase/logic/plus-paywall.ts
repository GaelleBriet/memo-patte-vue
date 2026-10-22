import type { PaidPlan, PlusOffer } from '../service/billing.service'
import type { CheckoutOutcome } from '../service/checkout.service'
import type { RouteLocationRaw } from 'vue-router'
import { accountFirstRoute, signInRoute } from '@/shared/utils/sign-in-route'

export type PlusBenefit = 'backup' | 'devices' | 'photos'

export type CheckoutNext =
  | { kind: 'phase'; phase: 'success' | 'cancelled' | 'offers' }
  | { kind: 'detour'; route: RouteLocationRaw }

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

export function nextAfterCheckout(outcome: CheckoutOutcome): CheckoutNext {
  switch (outcome.kind) {
    case 'needs-account':
      return { kind: 'detour', route: accountFirstRoute() }
    case 'needs-sign-in':
      return { kind: 'detour', route: signInRoute('plus') }
    case 'purchased':
      return { kind: 'phase', phase: 'success' }
    case 'cancelled':
      return { kind: 'phase', phase: 'cancelled' }
    case 'already-plus':
      return { kind: 'phase', phase: 'offers' }
  }
}
