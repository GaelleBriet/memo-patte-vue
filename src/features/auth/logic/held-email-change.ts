import type { EmailChangeStep } from './email-change-form'

export type HeldEmailChange = {
  step: EmailChangeStep
  email: string
  newAddress: string
  currentAddress: string
  sentAt: number
  code: string
}

let held: HeldEmailChange | null = null

export function holdEmailChange(state: HeldEmailChange): void {
  held = state
}

export function takeHeldEmailChange(): HeldEmailChange | null {
  const taken = held
  held = null
  return taken
}

export function clearHeldEmailChange(): void {
  held = null
}
