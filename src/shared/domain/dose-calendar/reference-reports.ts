import { hoursOf, sameFrequency, sameHours, type Hour } from './reference-grid'
import type { Journey } from './reference-days'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

export type ReportDeparture = {
  report: ReferenceLine
  written: ReferenceSetting
  /** La journée de départ telle que le calendrier la lit (R4). */
  day: Journey
  covered: ReadonlySet<Hour>
  /** Le jour de départ est celui où les heures changent (R4). */
  hoursChangeThatDay: boolean
  notesOfDay: readonly ReferenceLine[]
  settingOf: (id: string) => ReferenceSetting
}

/** Ce qu'emporte un report, sous quelles heures, et ce que perd sa journée de départ. */
export type ReportOutcome =
  { beaten: true } | { beaten: false; carried: Hour[]; lost: Hour[]; hoursOf: ReferenceSetting }

/**
 * R7, R11, R4 : un report battu par une prise de sa dose est sans effet ; sinon il emporte sa dose
 * et les suivantes de sa journée encore sans prise. Écrit sous un autre réglage que celui du jour où
 * les heures changent, il ne voit que les prises écrites sous ses heures, emporte ses heures à lui, et le
 * jour de départ perd les heures qui suivent la sienne, au moins autant qu'il en emporte.
 */
export function reportOutcome(departure: ReportDeparture): ReportOutcome {
  const { report, written, day, covered, hoursChangeThatDay, notesOfDay, settingOf } = departure
  const fromItsDose = (hour: Hour) => hour === null || hour >= (report.dueTime ?? '')

  if (!hoursChangeThatDay || written.id === day.setting.id) {
    if (covered.has(report.dueTime)) return { beaten: true }
    const carried = day.hours.filter((hour) => fromItsDose(hour) && !covered.has(hour))
    return { beaten: false, carried, lost: carried, hoursOf: day.setting }
  }

  const seen = new Set(
    notesOfDay
      .filter((note) => sameHours(settingOf(note.settingId), written))
      .map((note) => note.dueTime),
  )
  if (seen.has(report.dueTime)) return { beaten: true }
  const carried = hoursOf(written).filter((hour) => fromItsDose(hour) && !seen.has(hour))
  const lost: Hour[] = []
  for (const hour of [...day.hours].reverse()) {
    if (covered.has(hour)) continue
    if (fromItsDose(hour) || lost.length < carried.length) lost.unshift(hour)
  }
  return { beaten: false, carried, lost, hoursOf: written }
}

/**
 * R7, R10, #796 : à fréquence gardée, la date choisie emmène le report qui arrive à la dose du
 * moment ; elle est la première échéance d'un réglage écrit après celui du report, à ses heures.
 */
export function chosenDateOf(
  report: ReferenceLine,
  live: readonly ReferenceSetting[],
  settingOf: (id: string) => ReferenceSetting,
): ReferenceSetting | undefined {
  const writtenAt = settingOf(report.settingId).createdAt
  for (let index = 1; index < live.length; index += 1) {
    const setting = live[index]!
    const keepsFrequency = sameFrequency(live[index - 1]!, setting)
    const picksArrival = setting.firstDueChosen && setting.firstDueOn === report.targetOn
    if (keepsFrequency && picksArrival && setting.createdAt > writtenAt) return setting
  }
  return undefined
}

/**
 * R7, R9.2, #796 : le jour d'arrivée reçoit les heures emportées ; une journée d'échéance à d'autres
 * heures les porte avec les siennes, sans en ajouter ; un rythme qui part de lui ne garde qu'elles.
 * La date choisie qui emmène le report en reçoit autant, aux dernières heures de son réglage.
 */
export function arrivedOn(
  existing: Journey | undefined,
  outcome: { carried: Hour[]; hoursOf: ReferenceSetting },
  arrival: ReferenceSetting,
  { opensRhythm, chosen }: { opensRhythm: boolean; chosen: ReferenceSetting | undefined },
): Journey {
  const under = chosen ?? outcome.hoursOf
  const received = {
    setting: sameHours(arrival, under) ? arrival : under,
    hours: chosen ? hoursOf(chosen).slice(-outcome.carried.length) : outcome.carried,
  }
  const day = opensRhythm ? undefined : existing
  if (day === undefined || day.hours.length === 0) {
    return { setting: received.setting, hours: [...received.hours].sort() }
  }
  if (!sameHours(day.setting, received.setting)) return day
  return { setting: day.setting, hours: [...new Set([...day.hours, ...received.hours])].sort() }
}
