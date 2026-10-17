import type { Slot } from './calendar'
import type { Day, Line, LineEffect, Setting } from './types'

/** Q38, #873 : une dose tombée que la question liste, du premier jour du réglage à la veille de la réponse. */
export const isListed = (
  setting: Pick<Setting, 'startsOn'>,
  answeredOn: Day,
  dueOn: Day,
): boolean => dueOn >= setting.startsOn && dueOn < answeredOn

/**
 * #873 : « Elles n'étaient pas à donner », écrite le jour de la réécriture du réglage, retire les doses
 * qu'elle a listées ; une ligne plus récente qu'elle tient (#867).
 */
export function answeredAway(setting: Setting, line: Line, dueOn: Day): boolean {
  const { updatedAt, createdAt, writtenOn, pastDosesStayUnlogged } = setting
  if (pastDosesStayUnlogged || writtenOn === undefined) return false
  if (updatedAt === undefined || updatedAt <= createdAt) return false
  return isListed(setting, writtenOn, dueOn) && line.updatedAt <= updatedAt
}

/**
 * #873 : les doses arrivées par un report et restées sans prise que la réponse a listées sortent du
 * calendrier ; un report qui n'apporte plus rien est sans effet, son départ ne les reprend pas.
 */
export function withoutAnswered(
  slots: readonly Slot[],
  arrivedBy: ReadonlyMap<string, Line>,
  settingAt: (day: Day) => Setting | undefined,
  effects: Map<string, LineEffect>,
): Slot[] {
  const listed = ({ key, due, coveredBy }: Slot) => {
    const report = arrivedBy.get(key)
    const setting = settingAt(due.dueOn)
    return coveredBy === null && report !== undefined && setting !== undefined
      ? answeredAway(setting, report, due.dueOn)
      : false
  }
  const kept = slots.filter((slot) => !listed(slot))
  const bringing = new Set(kept.map(({ key }) => arrivedBy.get(key)))
  for (const slot of slots.filter(listed)) {
    const report = arrivedBy.get(slot.key)!
    if (!bringing.has(report)) effects.set(report.id, { kind: 'idle', reason: 'nothing-to-move' })
  }
  return kept
}
