type DoseRow = { status: string; givenOn: string | null; dueOn: string }

export const isConsistentDose = (dose: DoseRow) =>
  ['given', 'extra'].includes(dose.status) === (dose.givenOn !== null) &&
  (dose.status !== 'extra' || dose.dueOn === dose.givenOn)

const isMove = (status: string) => status === 'postponed' || status === 'shift'

export const hasTargetOnlyOnMove = (dose: { status: string; targetOn: string | null }) =>
  isMove(dose.status) === (dose.targetOn !== null)

export const hasPreviousTargetDay = (dose: {
  previousTargetOn: string | null
  previousTargetTime: string | null
}) => dose.previousTargetTime === null || dose.previousTargetOn !== null

export const hasReportFactsOnlyOnReport = (dose: {
  status: string
  previousTargetOn: string | null
  previousTargetTime: string | null
  dueRank: number | null
}) =>
  dose.status === 'postponed' ||
  (dose.previousTargetOn === null && dose.previousTargetTime === null && dose.dueRank === null)
