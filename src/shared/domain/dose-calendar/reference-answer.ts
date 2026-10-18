import type { ReferenceDue as Due } from './reference-days'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

/**
 * #873 (décision du 18 octobre 2026) : seule la réponse « Elles n'étaient pas à donner » retire des
 * doses ; elle retire celles que la question a listées, tombées sans prise sous le réglage qui répond,
 * de son premier jour à la veille du jour de la réponse ; le jour de la réponse et la suite restent.
 * Un report plus récent que la réponse garde la dose qu'il a fait arriver (#867).
 */
function answeredOut(
  setting: ReferenceSetting | undefined,
  { day, covered }: Due,
  broughtBy: ReferenceLine | undefined,
): boolean {
  if (covered || setting === undefined || setting.fallenDosesAnswer !== 'not-due') return false
  const answeredOn = setting.writtenOn
  if (answeredOn === undefined || day < setting.startsOn || day >= answeredOn) return false
  const answeredAt = setting.updatedAt
  return broughtBy === undefined || answeredAt === undefined || broughtBy.updatedAt <= answeredAt
}

/** Les doses encore à donner ou à renseigner : ni couvertes, ni remplacées, ni écartées par la réponse. */
export function pendingKeys(
  dues: readonly Due[],
  lateDays: readonly (string | undefined)[],
  settingAt: (day: string) => ReferenceSetting | undefined,
  arrivedBy: ReadonlyMap<string, ReferenceLine>,
): string[] {
  return dues
    .filter((due) => !due.covered && !lateDays.includes(due.day))
    .filter((due) => !answeredOut(settingAt(due.day), due, arrivedBy.get(due.key)))
    .map(({ key }) => key)
}
