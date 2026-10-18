import type { ReferenceDue as Due } from './reference-days'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

/** « Elles n'étaient pas à donner » ôte ce que la question a montré, et rien d'autre (#873, #867). */
function answeredOut(
  setting: ReferenceSetting | undefined,
  { key, covered }: Due,
  broughtBy: ReferenceLine | undefined,
): boolean {
  if (covered || setting?.fallenDosesAnswer !== 'not-due') return false
  if (!(setting.answeredDues ?? []).includes(key)) return false
  const { answeredAt } = setting
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
