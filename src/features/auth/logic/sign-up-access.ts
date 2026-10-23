import type { LocationQuery } from 'vue-router'

import type { SignInMode } from './sign-in-form'
import { asksSignUp } from '@/shared/utils/sign-in-route'

export const ACCOUNT_FIRST_ORIGIN = 'plus-account'

export function offersSignUp(query: LocationQuery): boolean {
  return query.from === ACCOUNT_FIRST_ORIGIN
}

export function initialSignInMode(query: LocationQuery): SignInMode {
  return offersSignUp(query) && asksSignUp(query) ? 'sign-up' : 'sign-in'
}
