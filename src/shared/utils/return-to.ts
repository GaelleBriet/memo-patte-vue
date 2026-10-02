import type { RouteLocationRaw, Router } from 'vue-router'

/** Revient à `target` par l'historique quand c'est l'écran précédent : il n'est pas doublé. */
export function returnTo(router: Router, target: RouteLocationRaw): void {
  const previous = router.options.history.state.back
  if (typeof previous === 'string' && previous === router.resolve(target).fullPath) router.back()
  else void router.replace(target)
}

/**
 * Comme `returnTo`, sans jamais lever : une navigation refusée ou en échec retombe sur `fallback`.
 */
export async function returnToOr(
  router: Router,
  target: RouteLocationRaw,
  fallback: RouteLocationRaw,
): Promise<void> {
  const previous = router.options.history.state.back
  try {
    if (typeof previous === 'string' && previous === router.resolve(target).fullPath) {
      router.back()
      return
    }
    if ((await router.replace(target)) === undefined) return
  } catch {
    // La route de repli prend le relais.
  }
  await router.replace(fallback).catch(() => undefined)
}
