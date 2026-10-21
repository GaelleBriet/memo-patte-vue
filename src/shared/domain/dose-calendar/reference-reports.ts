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
  /** #983 : la ligne la plus récente du jour de départ est « pas à donner » ; elle ne change pas ses heures pour le report. */
  answeredThatDay: boolean
  /** Le réglage en vigueur ce jour-là, celui dont les heures viennent de changer. */
  inForce: ReferenceSetting | undefined
  /** Un réglage écrit après celui du report change les heures de sa journée. */
  hoursChangedSince: boolean
  /** Les heures du report et celles des doses arrivées sur sa journée (#864). */
  itsHours: Hour[]
  /** Aux heures du report : les prises à ces heures, et celles des réglages écrits avant le sien. */
  coveredAtItsHours: ReadonlySet<Hour>
}

/** Ce qu'emporte un report, sous quelles heures, et ce que perd sa journée de départ. */
export type ReportOutcome =
  { beaten: true } | { beaten: false; carried: Hour[]; lost: Hour[]; hoursOf: ReferenceSetting }

/**
 * R7, R11, R4 : un report battu par une prise de sa dose est sans effet ; sinon il emporte sa dose
 * et les suivantes de sa journée encore sans prise. Le jour où les heures changent, écrit sous d'autres
 * heures que celles de la journée, ou avant le réglage qui la relit, il garde les heures où il a été
 * écrit, où les prises du jour se posent comme sur une journée à ces heures ; le jour de départ, relu aux
 * nouvelles heures, perd celles qui suivent sa dose et au moins autant qu'il emporte, mais garde les
 * doses qui restaient à donner avant lui.
 */
export function reportOutcome(departure: ReportDeparture): ReportOutcome {
  const {
    report,
    written,
    day,
    covered,
    hoursChangeThatDay,
    answeredThatDay,
    inForce,
    hoursChangedSince,
    coveredAtItsHours,
    itsHours,
  } = departure
  const fromItsDose = (hour: Hour) => hour === null || hour >= (report.dueTime ?? '')
  const otherHours = !sameHours(written, day.setting)
  const readAtNewHours =
    day.setting === inForce && written.id !== day.setting.id && hoursChangedSince

  if (!(hoursChangeThatDay || answeredThatDay) || !(otherHours || readAtNewHours)) {
    if (covered.has(report.dueTime)) return { beaten: true }
    const carried = day.hours.filter((hour) => fromItsDose(hour) && !covered.has(hour))
    return { beaten: false, carried, lost: carried, hoursOf: day.setting }
  }

  if (coveredAtItsHours.has(report.dueTime)) return { beaten: true }
  const carried = itsHours.filter((hour) => fromItsDose(hour) && !coveredAtItsHours.has(hour))
  const rank = itsHours.filter((hour) => !fromItsDose(hour)).length
  const notedAfter = itsHours.filter(
    (hour) => fromItsDose(hour) && coveredAtItsHours.has(hour),
  ).length
  const waitingBefore = Math.max(0, rank + notedAfter - covered.size)
  const free = day.hours.filter((hour) => !covered.has(hour))
  const lost = free.slice(waitingBefore)
  return { beaten: false, carried, lost, hoursOf: written }
}

/** R4, R7 : un réglage écrit après celui du report change les heures de sa journée. */
export const hoursChangedSince = (
  live: readonly ReferenceSetting[],
  written: ReferenceSetting,
  day: string,
): boolean =>
  live.some(
    (each) =>
      each.startsOn === day && each.createdAt > written.createdAt && !sameHours(each, written),
  )

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
 * R7, R9.2, #796 : le jour d'arrivée garde ses doses et y ajoute celles qui arrivent, une heure une
 * fois ; un rythme qui part de lui ne garde qu'elles ; la date choisie reçoit la journée de son réglage.
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
    hours: chosen ? hoursOf(chosen) : outcome.carried,
  }
  const day = opensRhythm ? undefined : existing
  if (day === undefined || day.hours.length === 0) {
    return { setting: received.setting, hours: [...received.hours].sort() }
  }
  return { setting: day.setting, hours: [...new Set([...day.hours, ...received.hours])].sort() }
}
