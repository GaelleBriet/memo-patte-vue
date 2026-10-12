import { hoursOf, isOnGrid, keyOf, stepped, type Hour } from './reference-grid'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

export type Journey = { setting: ReferenceSetting; hours: Hour[] }
export type Segment = { origin: string; from: string; to: string | null }
export type Claim = { setting: ReferenceSetting; end: string | null; segments: Segment[] }
export type ReferenceDue = { key: string; day: string; covered: boolean }

// R1, R4 : sortie du calendrier, la journée où un réglage cède la place, ou celle d'origine d'un
// de ses reports s'il est remplacé le jour où il commence, se lit avec ce réglage.
export function leftDays(
  claims: readonly Claim[],
  reports: readonly ReferenceLine[],
  stop: string | null,
): Map<string, Journey> {
  const left = new Map<string, Journey>()
  for (const { setting, end, segments } of claims) {
    if (end === null) continue
    const reported = reports
      .filter(({ settingId }) => settingId === setting.id)
      .map(({ dueOn }) => dueOn)
    for (const day of end === setting.startsOn ? [...reported, end] : [end]) {
      const open =
        (setting.endsOn === null || day <= setting.endsOn) && (stop === null || day < stop)
      const wasDay = segments.some(
        (segment) =>
          day >= segment.from &&
          (segment.to === null || day <= segment.to) &&
          isOnGrid(segment.origin, setting.frequency, day),
      )
      if (open && wasDay) left.set(day, { setting, hours: hoursOf(setting) })
    }
  }
  return left
}

// R4 : une prise dont l'échéance a quitté le calendrier couvre la première échéance qui suit, à
// moins d'un pas de son réglage ; déjà couverte ou trop loin, la prise est sans effet.
export function coverOrphans(
  notes: readonly ReferenceLine[],
  matched: ReadonlySet<ReferenceLine>,
  dues: ReferenceDue[],
  settingOf: (id: string) => ReferenceSetting,
): void {
  const orphans = notes
    .filter((note) => !matched.has(note))
    .sort((a, b) => keyOf(a.dueOn, a.dueTime).localeCompare(keyOf(b.dueOn, b.dueTime)))
  for (const note of orphans) {
    const { frequency } = settingOf(note.settingId)
    const due = dues.find((each) => each.key > keyOf(note.dueOn, note.dueTime))
    if (due !== undefined && due.day < stepped(note.dueOn, frequency, 1)) due.covered = true
  }
}
