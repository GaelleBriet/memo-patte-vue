import type { Router } from 'vue-router'

import { track } from '@/core/analytics'

export function installPageviewTracking(router: Router): void {
  router.afterEach(() => track('$pageview'))
}
