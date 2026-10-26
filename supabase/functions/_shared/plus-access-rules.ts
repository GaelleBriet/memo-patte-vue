/** Décidé par Gaelle le 2026-10-26 (#89, questions 2 et 7). */
const REFUND_ENDS_ACCESS = true
const PAUSE_SUSPENDS_BACKUP = true

export type PlusAccessRules = {
  /** Un remboursement coupe l'accès à sa date ; sinon l'abonnement court jusqu'à la fin payée. */
  refundEndsAccess: boolean
  /** Un abonnement en pause met la sauvegarde en pause ; sinon elle continue jusqu'à la reprise. */
  pauseSuspendsBackup: boolean
}

export const PLUS_ACCESS_RULES: PlusAccessRules = {
  refundEndsAccess: REFUND_ENDS_ACCESS,
  pauseSuspendsBackup: PAUSE_SUSPENDS_BACKUP,
}
