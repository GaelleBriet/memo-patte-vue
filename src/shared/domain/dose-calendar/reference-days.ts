import {
  hoursOf,
  isOnGrid,
  keyOf,
  plusDays,
  sameFrequency,
  sameHours,
  stepped,
  type Hour,
} from './reference-grid'
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

// R1 : chaque réglage vaut jusqu'au premier jour du suivant, ou jusqu'à l'arrêt, date de fin comprise.
export function inForceOf(live: readonly ReferenceSetting[]) {
  const endOf = (index: number) => live[index + 1]?.startsOn ?? live[index]!.stoppedOn
  const settingAt = (day: string) => {
    const index = live.filter(({ startsOn }) => startsOn <= day).length - 1
    const setting = live[index]
    if (setting === undefined) return undefined
    const end = endOf(index)
    const open = (end === null || day < end) && (setting.endsOn === null || day <= setting.endsOn)
    return open ? setting : undefined
  }
  return { endOf, settingAt }
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

// R4 : une prise donnée dont l'échéance a quitté le calendrier couvre la première échéance qui suit,
// à moins d'un pas de son réglage ; un oubli ne couvre que sa propre échéance.
export function coverOrphans(
  notes: readonly ReferenceLine[],
  matched: ReadonlySet<ReferenceLine>,
  dues: ReferenceDue[],
  settingOf: (id: string) => ReferenceSetting,
): void {
  const orphans = notes
    .filter((note) => note.status === 'given' && !matched.has(note))
    .sort((a, b) => keyOf(a.dueOn, a.dueTime).localeCompare(keyOf(b.dueOn, b.dueTime)))
  for (const note of orphans) {
    const { frequency } = settingOf(note.settingId)
    const due = dues.find((each) => each.key > keyOf(note.dueOn, note.dueTime))
    if (due !== undefined && due.day < stepped(note.dueOn, frequency, 1)) due.covered = true
  }
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

// R4 : une prise couvre son échéance ; le jour où les heures changent, celles qui visaient l'ancien
// réglage couvrent les premières heures du nouveau, à hauteur de leur nombre ; une prise donnée
// d'avant l'arrêt couvre toute la première journée de la reprise, un oubli sa seule échéance (R8).
export function coverageOf(
  notes: readonly ReferenceLine[],
  borrowed: readonly ReferenceLine[],
  translated: ReadonlyMap<string, string>,
  settingOf: (id: string) => ReferenceSetting,
  matched: Set<ReferenceLine>,
) {
  return (day: string, journey: Journey): Set<Hour> => {
    const ofDay = notes.filter((note) => note.dueOn === day)
    const exact = ofDay.filter(
      (note) =>
        borrowed.includes(note) ||
        !translated.has(day) ||
        sameHours(settingOf(note.settingId), journey.setting),
    )
    ofDay
      .filter((note) => !exact.includes(note) || journey.hours.includes(note.dueTime))
      .forEach((note) => matched.add(note))
    const covered = new Set(
      journey.hours.filter((hour) => exact.some((note) => note.dueTime === hour)),
    )
    // R4 : une journée de l'ancien réglage entièrement notée n'a plus rien à donner.
    const whole =
      ofDay.some((note) => borrowed.includes(note) && note.status === 'given') ||
      ofDay.some(
        (note) =>
          !exact.includes(note) &&
          hoursOf(settingOf(note.settingId)).every((hour) =>
            ofDay.some((other) => other.settingId === note.settingId && other.dueTime === hour),
          ),
      )
    let elsewhere = ofDay.length - exact.length
    for (const hour of journey.hours) {
      if ((elsewhere > 0 || whole) && !covered.has(hour)) {
        covered.add(hour)
        elsewhere -= 1
      }
    }
    return covered
  }
}

export type ReportMove = { beaten: boolean; moved: Hour[]; bringing: Hour[] }
export type DayCover = { hours: readonly Hour[]; covered: ReadonlySet<Hour> }

// R7 : un report emporte son heure et les suivantes encore sans prise ; après un changement d'heures
// seules, il garde ses doses comptées aux heures d'avant (`before`), retirées à partir du même rang.
export function reportMove(now: DayCover, dueTime: Hour, before: DayCover | null): ReportMove {
  const isAfter = (hour: Hour) => (hour ?? '') >= (dueTime ?? '')
  const free = (day: DayCover) => day.hours.filter((hour) => !day.covered.has(hour))
  if (before === null) {
    const following = free(now).filter(isAfter)
    return { beaten: now.covered.has(dueTime), moved: following, bringing: following }
  }
  const first = before.hours.findIndex(isAfter)
  const rank = first < 0 || now.hours.length === 0 ? -1 : Math.min(first, now.hours.length - 1)
  return {
    beaten: before.covered.has(dueTime),
    moved: rank < 0 ? [] : now.hours.slice(rank).filter((hour) => !now.covered.has(hour)),
    bringing: free(before).filter(isAfter),
  }
}

// R7 : les heures d'avant un changement d'heures seules, celles du premier réglage du rythme qui lit
// la journée d'origine, pas plus tôt que celui du report ; aucune si elles n'ont pas changé.
export function hoursBefore(
  live: readonly ReferenceSetting[],
  episode: readonly ReferenceSetting[],
  own: ReferenceSetting,
  from: ReferenceSetting,
): ReferenceSetting | undefined {
  let first = live.indexOf(from)
  while (
    first > 0 &&
    sameFrequency(live[first - 1]!, from) &&
    episode.indexOf(live[first - 1]!) >= episode.indexOf(own)
  ) {
    first -= 1
  }
  const reference = live[first]
  return reference === undefined || sameHours(reference, from) ? undefined : reference
}
