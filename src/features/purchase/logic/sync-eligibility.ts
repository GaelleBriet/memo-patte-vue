import { isPlusActive, type PlusStatus } from './plus-status'

export function isSyncEligible(hasPlusAccount: boolean, status: PlusStatus): boolean {
  return hasPlusAccount && isPlusActive(status)
}
