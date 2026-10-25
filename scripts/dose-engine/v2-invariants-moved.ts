import { treatmentView, type Day, type TreatmentViewInput } from '@/shared/domain/dose-calendar'

import type { Broken } from './v2-reading'
import type { V2Step } from './v2-walk'

const timesOn = (input: TreatmentViewInput, day: Day) =>
  treatmentView(input)
    .slots(day, day)
    .map(({ due, state }) => ({ time: due.dueTime, state }))

/**
 * R7, R11 : « Prochaine dose » emmène la dose touchée et les heures suivantes encore à donner de sa
 * journée ; chacune se retrouve au jour choisi, une même heure comptant une fois, ou le geste est refusé.
 */
export function movedArrives({ before, after, gesture, outcome }: V2Step): Broken | null {
  if (gesture?.kind !== 'move' || outcome === null || outcome.changes.length === 0) return null
  const { due, to } = gesture
  if (to === due.dueOn) return null
  const leaving = timesOn(before, due.dueOn)
    .filter(({ state }) => state === 'pending')
    .map(({ time }) => time)
    .filter((time) => due.dueTime === null || (time !== null && time >= due.dueTime))
  const arrived = timesOn(after, to).map(({ time }) => time)
  const missing = leaving.filter((time) => !arrived.includes(time))
  const added = arrived.length - timesOn(before, to).length
  if (missing.length === 0 || added >= leaving.length) return null
  return {
    invariant: 'dose déplacée présente',
    detail: `parties du ${due.dueOn} : ${JSON.stringify(leaving)}, le ${to} : ${JSON.stringify(arrived)}`,
  }
}
