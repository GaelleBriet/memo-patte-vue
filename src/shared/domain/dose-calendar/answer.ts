import type { Slot } from './calendar'
import type { Day, Line, LineEffect, Setting } from './types'

/** Q38, #873 : une dose tombée que la question liste, du premier jour du réglage à la veille de la réponse. */
export const isListed = (
  setting: Pick<Setting, 'startsOn'>,
  answeredOn: Day,
  dueOn: Day,
): boolean => dueOn >= setting.startsOn && dueOn < answeredOn

/**
 * #873 : « Elles n'étaient pas à donner » retire les doses qu'elle a listées ; le report plus récent
 * qu'elle qui y faisait arriver la dose tient (#867).
 */
function answeredAway(setting: Setting, dueOn: Day, report: Line | undefined): boolean {
  const { fallenDosesAnswer, writtenOn, updatedAt } = setting
  if (fallenDosesAnswer !== 'not-due' || writtenOn === undefined) return false
  const newer = report !== undefined && updatedAt !== undefined && report.updatedAt > updatedAt
  return isListed(setting, writtenOn, dueOn) && !newer
}

/**
 * #873 : les doses restées sans prise que la réponse a listées sortent du calendrier ; un report qui
 * n'apporte plus rien est sans effet, son départ ne les reprend pas.
 */
export function withoutAnswered(
  slots: readonly Slot[],
  arrivedBy: ReadonlyMap<string, Line>,
  settingAt: (day: Day) => Setting | undefined,
  effects: Map<string, LineEffect>,
): Slot[] {
  const listed = ({ key, due, coveredBy }: Slot) => {
    const setting = settingAt(due.dueOn)
    return coveredBy === null && setting !== undefined
      ? answeredAway(setting, due.dueOn, arrivedBy.get(key))
      : false
  }
  const kept = slots.filter((slot) => !listed(slot))
  const bringing = new Set(kept.map(({ key }) => arrivedBy.get(key)))
  for (const slot of slots.filter(listed)) {
    const report = arrivedBy.get(slot.key)
    if (report !== undefined && !bringing.has(report)) {
      effects.set(report.id, { kind: 'idle', reason: 'nothing-to-move' })
    }
  }
  return kept
}
