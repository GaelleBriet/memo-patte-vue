import { isOnGrid } from './grid'
import type { Journey } from './journeys'
import type { Day, Line, Setting } from './types'

export type Segment = { origin: Day; from: Day; to: Day | null }

export type Claim = { setting: Setting; end: Day | null; segments: Segment[] }

// R1, R4 : sortie du calendrier, la journée où un réglage cède la place, ou celle d'origine d'un de
// ses reports s'il est remplacé le jour où il commence, se lit avec ce réglage.
export function leftDays(
  claims: readonly Claim[],
  reports: readonly Line[],
  closedFrom: Day | null,
  handed: ReadonlySet<string>,
  journeyOn: (day: Day, setting: Setting) => Journey,
  landed: readonly Line[],
) {
  const left = new Map<Day, Journey>()
  for (const { setting, end, segments } of claims) {
    if (end === null || handed.has(setting.id)) continue
    // R6 : un décalage du réglage ne laisse aucune de ses échéances jusqu'à son ancrage.
    const turnedAway = (day: Day) =>
      landed.some(
        (turn) => turn.settingId === setting.id && turn.dueOn < day && day <= turn.targetOn!,
      )
    const reported = reports
      .filter(({ settingId, dueOn }) => settingId === setting.id && !turnedAway(dueOn))
      .map(({ dueOn }) => dueOn)
    for (const day of end === setting.startsOn ? [...reported, end] : [end]) {
      const open =
        (setting.endsOn === null || day <= setting.endsOn) &&
        (closedFrom === null || day < closedFrom)
      const wasDay = segments.some(
        (segment) =>
          day >= segment.from &&
          (segment.to === null || day <= segment.to) &&
          isOnGrid(segment.origin, setting.frequency, day),
      )
      if (open && wasDay) left.set(day, journeyOn(day, setting))
    }
  }
  return left
}
