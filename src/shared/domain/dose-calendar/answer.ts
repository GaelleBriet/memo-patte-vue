import type { Slot } from './calendar'
import type { Day, Line, LineEffect, Setting } from './types'

/** Q38 : une dose tombée que la question montre, du premier jour du réglage à la veille de la réponse. */
export const isListed = (
  setting: Pick<Setting, 'startsOn'>,
  answeredOn: Day,
  dueOn: Day,
): boolean => dueOn >= setting.startsOn && dueOn < answeredOn

/** #873 : seules les échéances listées par la question sortent ; un report plus récent que la réponse tient (#867). */
function answeredAway(setting: Setting, key: string, report: Line | undefined): boolean {
  const { fallenDosesAnswer, answeredDues, answeredAt } = setting
  if (fallenDosesAnswer !== 'not-due' || !answeredDues?.includes(key)) return false
  return report === undefined || answeredAt === undefined || report.updatedAt <= answeredAt
}

/** #873 : les doses listées sans prise sortent ; un report qui n'apporte plus rien est sans effet. */
export function withoutAnswered(
  slots: readonly Slot[],
  arrivedBy: ReadonlyMap<string, Line>,
  settingAt: (day: Day) => Setting | undefined,
  effects: Map<string, LineEffect>,
): Slot[] {
  const listed = ({ key, due, coveredBy }: Slot) => {
    const setting = settingAt(due.dueOn)
    return coveredBy === null && setting !== undefined
      ? answeredAway(setting, key, arrivedBy.get(key))
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
