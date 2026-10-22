import type { RouteLocationRaw } from 'vue-router'

import type { PlusStatus } from './plus-status'
import type { RestoreOutcome } from '../service/checkout.service'
import { signInRoute } from '@/shared/utils/sign-in-route'

export type RestoreOrigin = 'plus' | 'settings-plus'

export type RestoreNext =
  | { kind: 'detour'; route: RouteLocationRaw }
  | { kind: 'offline' }
  | { kind: 'restored'; status: PlusStatus }

export function nextAfterRestore(outcome: RestoreOutcome, from: RestoreOrigin): RestoreNext {
  switch (outcome.kind) {
    case 'needs-account':
    case 'needs-sign-in':
      return { kind: 'detour', route: signInRoute(from) }
    case 'offline':
      return { kind: 'offline' }
    case 'restored':
      return outcome
  }
}
