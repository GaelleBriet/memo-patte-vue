import type { Router } from 'vue-router'

type LazyView = () => Promise<unknown>

export async function preloadRouteViews(router: Router, names: string[]): Promise<void> {
  await Promise.all(
    names.map((name) => {
      const view = router.getRoutes().find((route) => route.name === name)?.components?.default
      if (typeof view !== 'function')
        throw new Error(`vue de la route ${name} introuvable ou déjà chargée`)
      return (view as LazyView)()
    }),
  )
}
