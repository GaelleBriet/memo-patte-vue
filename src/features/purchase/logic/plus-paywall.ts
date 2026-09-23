import type { PaidPlan, PlusOffer } from '../service/billing.service'

export type PlusOrigin = 'pdf' | 'general'

export type PlusBenefit = 'backup' | 'devices' | 'photos' | 'pdf'

export type PitchBenefit = { benefit: PlusBenefit; highlighted: boolean }

export type CheckoutBar =
  | { kind: 'offer'; offer: PlusOffer }
  | { kind: 'connecting' }
  | { kind: 'unavailable'; retrying: boolean }

const GENERAL_BENEFITS: readonly PlusBenefit[] = ['backup', 'devices', 'photos', 'pdf']

const OFFER_ORDER: readonly PaidPlan[] = ['annual', 'monthly', 'lifetime']

const PRESELECTED_PLAN: PaidPlan = 'annual'

export function plusOriginOf(from: unknown): PlusOrigin {
  return from === 'pdf' ? 'pdf' : 'general'
}

export function pitchBenefits(origin: PlusOrigin): PitchBenefit[] {
  const fromPdf = origin === 'pdf'
  const order: readonly PlusBenefit[] = fromPdf
    ? ['pdf', ...GENERAL_BENEFITS.filter((benefit) => benefit !== 'pdf')]
    : GENERAL_BENEFITS
  return order.map((benefit) => ({ benefit, highlighted: fromPdf && benefit === 'pdf' }))
}

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
  if (!state.answered) return { kind: 'connecting' }
  return { kind: 'unavailable', retrying: state.loading }
}
