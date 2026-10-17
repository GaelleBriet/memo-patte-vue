import { hoursOf, isOnGrid, plusDays, sameHours, type Hour } from './reference-grid'
import { isMoreRecent } from './reference-lines'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

export type Journey = { setting: ReferenceSetting; hours: Hour[] }
export type Segment = { origin: string; from: string; to: string | null }
export type Claim = { setting: ReferenceSetting; end: string | null; segments: Segment[] }
export type ReferenceDue = { key: string; day: string; covered: boolean }
export type Replaced = { from: string; to: string; onDueDay: boolean }

// R1, R4 : sortie du calendrier, la journée où un réglage cède la place, ou celle d'origine d'un
// de ses reports s'il est remplacé le jour où il commence, se lit avec ce réglage.
export function leftDays(
  claims: readonly Claim[],
  reports: readonly ReferenceLine[],
  closedFrom: string | null,
): Map<string, Journey> {
  const left = new Map<string, Journey>()
  for (const { setting, end, segments } of claims) {
    if (end === null) continue
    const reported = reports
      .filter(({ settingId }) => settingId === setting.id)
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
      if (open && wasDay) left.set(day, { setting, hours: hoursOf(setting) })
    }
  }
  return left
}

// TR-30 : le jour de l'arrêt se lit avec le réglage arrêté, sans y laisser d'échéance ; une reprise
// qui y a sa journée y lit ses heures, toutes couvertes par une prise d'avant l'arrêt (R8, Q-G3).
export function stopDayOf(stopped: ReferenceSetting) {
  const stop = stopped.stoppedOn
  const closedFrom = stop === null ? null : plusDays(stop, 1)
  const stoppedAt = (day: string) =>
    day === stop && (stopped.endsOn === null || day <= stopped.endsOn) ? stopped : undefined
  return { closedFrom, stoppedAt }
}

// R10, TR-9 : remplacé le jour même par un réglage sans date choisie qui continue sa grille repartie,
// un réglage n'a plus de journée sortie du calendrier : son remplaçant les lit.
export function handedOf(
  claims: readonly Claim[],
  chosenRestarts: ReadonlyMap<string, string>,
): Set<string> {
  return new Set(
    claims
      .filter(({ setting }, at) => {
        const successor = claims[at + 1]?.setting
        return (
          successor !== undefined &&
          successor.startsOn === setting.startsOn &&
          (successor.gridOriginOn === null || !successor.firstDueChosen) &&
          chosenRestarts.has(setting.id) &&
          chosenRestarts.get(successor.id) === chosenRestarts.get(setting.id)
        )
      })
      .map(({ setting }) => setting.id),
  )
}

// TR-9 : la dernière journée arrivée avant un réglage qui ne commence pas un jour d'échéance.
export function lateDaysOf(replaced: readonly Replaced[], fallen: ReadonlySet<string>) {
  return replaced
    .filter(({ onDueDay }) => !onDueDay)
    .map(({ from, to }) =>
      [...fallen]
        .filter((day) => day >= from && day < to)
        .sort()
        .at(-1),
    )
}

// R4 : une prise couvre son échéance quel que soit son réglage ; à une heure absente, la première
// échéance libre après la sienne, ou, le jour où les heures changent, la première libre ; une journée
// de l'ancien réglage toute notée couvre tout (R8) ; une prise écrite après le report du jour attend
// qu'il soit lu, et ne se pose que sur les heures qu'il a laissées.
export function coverageOf(
  notes: readonly ReferenceLine[],
  borrowed: readonly ReferenceLine[],
  translated: ReadonlySet<string>,
  settingOf: (id: string) => ReferenceSetting,
  matched: Set<ReferenceLine>,
  late: { is: (note: ReferenceLine) => boolean; settled: () => boolean },
) {
  return (
    day: string,
    journey: Journey,
    placeable?: (note: ReferenceLine) => boolean,
  ): Set<Hour> => {
    const ofDay = notes.filter((note) => note.dueOn === day)
    const underOldHours = (note: ReferenceLine) =>
      !borrowed.includes(note) &&
      translated.has(day) &&
      !sameHours(settingOf(note.settingId), journey.setting)
    const readAsOld = (note: ReferenceLine) => underOldHours(note) && !late.is(note)
    const covered = new Set<Hour>()
    const placed = new Set<ReferenceLine>()
    for (const hour of journey.hours) {
      const atHour = ofDay.filter((each) => each.dueTime === hour)
      const note = atHour.find((each) => atHour.every((other) => !isMoreRecent(other, each)))
      if (note === undefined) continue
      covered.add(hour)
      placed.add(note)
    }
    const waiting = ofDay
      .filter(
        (note) =>
          !placed.has(note) && (placeable?.(note) ?? true) && (late.settled() || !late.is(note)),
      )
      .sort((a, b) => (a.dueTime ?? '').localeCompare(b.dueTime ?? ''))
    for (const note of waiting) {
      if (note.status !== 'given' && !underOldHours(note)) continue
      const free = journey.hours.filter((hour) => !covered.has(hour))
      const later = free.filter(
        (hour) => hour === null || note.dueTime === null || hour > note.dueTime,
      )
      const next = underOldHours(note) ? free[0] : later.find((hour) => hour !== null)
      if (next === undefined) continue
      covered.add(next)
      placed.add(note)
    }
    const whole =
      ofDay.some((note) => borrowed.includes(note) && note.status === 'given') ||
      ofDay.some(
        (note) =>
          placeable === undefined &&
          readAsOld(note) &&
          hoursOf(settingOf(note.settingId)).every((hour) =>
            ofDay.some((other) => other.settingId === note.settingId && other.dueTime === hour),
          ),
      )
    ofDay
      .filter(
        (note) =>
          placed.has(note) ||
          journey.hours.includes(note.dueTime) ||
          readAsOld(note) ||
          (underOldHours(note) && late.settled() && journey.hours.length > 0),
      )
      .forEach((note) => matched.add(note))
    if (whole) journey.hours.forEach((hour) => covered.add(hour))
    return covered
  }
}

// R4, R7 : aux heures d'un report, seules les prises des réglages écrits avant le sien se déplacent.
export const writtenBefore =
  (written: ReferenceSetting, settingOf: (id: string) => ReferenceSetting) =>
  (note: ReferenceLine) =>
    settingOf(note.settingId).createdAt <= written.createdAt

// R4 : le jour où les heures changent, une prise écrite après le report du jour attend qu'il soit lu.
export function coverages({
  notes,
  borrowed,
  reports,
  translated,
  settingOf,
}: {
  notes: readonly ReferenceLine[]
  borrowed: readonly ReferenceLine[]
  reports: readonly ReferenceLine[]
  translated: ReadonlySet<string>
  settingOf: (id: string) => ReferenceSetting
}) {
  let reportsRead = false
  const late = {
    is: (note: ReferenceLine) => {
      const report = reports.find(({ dueOn }) => dueOn === note.dueOn && translated.has(dueOn))
      return report !== undefined && !borrowed.includes(note) && isMoreRecent(note, report)
    },
    settled: () => reportsRead,
  }
  const matched = new Set<ReferenceLine>()
  const coverage = (into: Set<ReferenceLine>) =>
    coverageOf([...notes, ...borrowed], borrowed, translated, settingOf, into, late)
  return {
    matched,
    coveredOn: coverage(matched),
    coveredAside: coverage(new Set()),
    settle: () => (reportsRead = true),
  }
}

/** #885 : le décalage d'un report plus récent que la réécriture de son réglage tient avec lui. */
export function shiftKeptByReport(
  turn: ReferenceLine,
  reports: readonly ReferenceLine[],
  settingOf: (id: string) => ReferenceSetting,
): boolean {
  const written = settingOf(turn.settingId)
  const rewrittenAt = written.updatedAt
  if (rewrittenAt === undefined || rewrittenAt <= written.createdAt) return false
  if (turn.dueOn < written.startsOn || turn.dueOn >= written.firstDueOn) return false
  if (rewrittenAt >= turn.updatedAt) return false
  if (reports.some(({ targetOn }) => targetOn === turn.dueOn)) return false
  return reports.some(
    (report) =>
      report.dueOn === turn.dueOn && typeof departureAfterRewrite(report, settingOf) === 'object',
  )
}

/** #867 : réglage réécrit sans la journée de départ du report : le plus récent des deux l'emporte. */
export function departureAfterRewrite(
  report: ReferenceLine,
  settingOf: (id: string) => ReferenceSetting,
): Journey | 'lost' | undefined {
  const written = settingOf(report.settingId)
  const rewrittenAt = written.updatedAt
  if (rewrittenAt === undefined || rewrittenAt <= written.createdAt) return undefined
  if (report.dueOn < written.startsOn || report.dueOn >= written.firstDueOn) return undefined
  if (rewrittenAt >= report.updatedAt) return 'lost'
  return { setting: written, hours: [report.dueTime] }
}
