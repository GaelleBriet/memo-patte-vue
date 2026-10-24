import type { Random } from './carnet'
import { staysExtra } from './v2-invariants-extra'
import { hoursOnly } from './v2-invariants-hours'
import { conservation, noDouble, undo } from './v2-invariants-lines'
import {
  naive,
  posology,
  previewIsResult,
  symmetry,
  symmetryAhead,
  time,
} from './v2-invariants-readings'
import { refusedCorrection, settingsProposal } from './v2-invariants-settings'
import type { Broken } from './v2-reading'
import type { V2Step } from './v2-walk'

/** Les invariants sur un pas joué, et le refus de Q38 ; le premier qui ne tient pas. */
export function brokenBy(step: V2Step, random: Random): Broken | null {
  const checks = [
    () => conservation(step),
    () => noDouble(step.after),
    () => posology(step.after),
    () => hoursOnly(step.after),
    () => time(step.after, random),
    () => symmetry(step.after, random),
    () => symmetryAhead(step.after, random),
    () => undo(step),
    () => staysExtra(step),
    () => previewIsResult(step),
    () => naive(step.after),
    () => settingsProposal(step),
    () => refusedCorrection(step),
  ]
  for (const check of checks) {
    const broken = check()
    if (broken !== null) return broken
  }
  return null
}
