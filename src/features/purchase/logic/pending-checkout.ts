const CHECKOUT_ROUTES: readonly unknown[] = ['plus', 'plus-account', 'sign-in']

export function keepsPendingCheckout(routeName: unknown): boolean {
  return CHECKOUT_ROUTES.includes(routeName)
}
