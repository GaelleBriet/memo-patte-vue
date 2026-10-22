const CHECKOUT_ROUTES: readonly unknown[] = ['plus', 'plus-account', 'sign-in']
const RESTORE_ROUTES: readonly unknown[] = ['plus', 'settings-plus', 'sign-in']

export function keepsPendingCheckout(routeName: unknown): boolean {
  return CHECKOUT_ROUTES.includes(routeName)
}

export function keepsPendingRestore(routeName: unknown): boolean {
  return RESTORE_ROUTES.includes(routeName)
}
