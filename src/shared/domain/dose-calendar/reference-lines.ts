import { hoursOf, keyOf, sameHours } from './reference-grid'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

/** Une prise ; « pas à donner » n'en est jamais une. */
export const isTaken = (line: ReferenceLine) => line.status === 'given' || line.status === 'missed'
/** Une ligne posée sur une échéance : une prise, ou « pas à donner ». */
export const isNote = (line: ReferenceLine) => isTaken(line) || line.status === 'not-due'
export const isMoreRecent = (a: ReferenceLine, b: ReferenceLine) =>
  a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id)

// R1, R8 : un arrêt clôt un épisode ; la reprise en ouvre un autre.
export function episodesOf(settings: readonly ReferenceSetting[]): ReferenceSetting[][] {
  // R9, R10 : un réglage remplacé avant son premier jour par un réglage écrit après lui cède sa place ce jour-là.
  const ordered = settings
    .map((setting) => {
      const startsOn = settings
        .filter(({ createdAt }) => createdAt > setting.createdAt)
        .reduce((day, newer) => (newer.startsOn < day ? newer.startsOn : day), setting.startsOn)
      return startsOn === setting.startsOn ? setting : { ...setting, startsOn }
    })
    .sort(
      (a, b) =>
        a.startsOn.localeCompare(b.startsOn) ||
        a.createdAt.localeCompare(b.createdAt) ||
        a.id.localeCompare(b.id),
    )
  const episodes: ReferenceSetting[][] = [[]]
  for (const setting of ordered) {
    episodes.at(-1)!.push(setting)
    if (setting.stoppedOn !== null) episodes.push([])
  }
  return episodes.filter((episode) => episode.length > 0)
}

// TR-25, R11 : une ligne par échéance et par famille, la plus récente ; une journée n'a qu'un report et qu'un décalage.
export function latestBy(lines: ReferenceLine[], keyOfLine: (line: ReferenceLine) => string) {
  const latest = new Map<string, ReferenceLine>()
  for (const line of lines) {
    const kept = latest.get(keyOfLine(line))
    if (kept === undefined || isMoreRecent(line, kept)) latest.set(keyOfLine(line), line)
  }
  return [...latest.values()].sort((a, b) => a.dueOn.localeCompare(b.dueOn))
}

// R4 : le seul jour où une prise visant d'autres heures couvre les premières heures : le premier jour
// d'un réglage aux heures changées, sauf une journée touchée sous d'autres heures que celles du réglage
// qui cède la place, qui garde ses doses.
function translatedDaysOf(
  live: readonly ReferenceSetting[],
  touchedOn: (day: string) => ReferenceSetting | undefined,
): Set<string> {
  const days = new Set<string>()
  for (let index = 1; index < live.length; index += 1) {
    const prior = live[index - 1]!
    const setting = live[index]!
    const touched = touchedOn(setting.startsOn)
    const reread = touched === undefined || sameHours(touched, prior) || sameHours(touched, setting)
    if (!sameHours(prior, setting) && reread) days.add(setting.startsOn)
  }
  return days
}

// R4 : hors du jour où les heures changent, une journée notée ou déplacée garde les heures du réglage
// de sa ligne la plus récente (TR-25), celles qu'elle avait quand elle a été touchée.
export function touchedJourneys(
  lines: readonly ReferenceLine[],
  live: readonly ReferenceSetting[],
  settingOf: (id: string) => ReferenceSetting,
  chosenOf: (report: ReferenceLine) => ReferenceSetting | undefined,
) {
  const latest = new Map<string, { line: ReferenceLine; hoursOf: ReferenceSetting }>()
  const touch = (day: string, line: ReferenceLine, hoursOf: ReferenceSetting) => {
    const kept = latest.get(day)
    if (kept === undefined || isMoreRecent(line, kept.line)) latest.set(day, { line, hoursOf })
  }
  for (const line of lines) {
    touch(line.dueOn, line, settingOf(line.settingId))
    const chosen = line.status === 'postponed' ? chosenOf(line) : undefined
    if (chosen !== undefined) touch(line.targetOn!, line, chosen)
  }
  const translated = translatedDaysOf(live, (day) => latest.get(day)?.hoursOf)
  const journeyOn = (day: string, setting: ReferenceSetting) => {
    const touched = latest.get(day)?.hoursOf ?? setting
    const own = translated.has(day) || sameHours(touched, setting) ? setting : touched
    return { setting: own, hours: hoursOf(own) }
  }
  return { translated, journeyOn }
}

// TR-25, R11 : par échéance et famille, la ligne la plus récente d'un épisode, quel que soit son
// réglage : deux prises du même jour et de la même heure sont la même dose.
export function episodeLinesOf(
  episode: readonly ReferenceSetting[],
  allLines: readonly ReferenceLine[],
): ReferenceLine[] {
  const own = allLines.filter((line) => episode.some(({ id }) => id === line.settingId))
  const latest = latestBy(
    own,
    (line) => `${keyOf(line.dueOn, line.dueTime)} ${isTaken(line) ? 'note' : line.status}`,
  )
  // I1 : une prise l'emporte toujours sur la ligne « pas à donner » de la même dose.
  const given = latest.filter(isTaken).map((line) => keyOf(line.dueOn, line.dueTime))
  return latest.filter(
    (line) => line.status !== 'not-due' || !given.includes(keyOf(line.dueOn, line.dueTime)),
  )
}

// R7 : une ligne de report par journée, sans les reports revenus à leur date.
export const reportsOf = (lines: readonly ReferenceLine[]): ReferenceLine[] =>
  latestBy(
    lines.filter(
      (line) =>
        line.status === 'postponed' && line.targetOn !== null && line.targetOn !== line.dueOn,
    ),
    (line) => line.dueOn,
  )

// R10 : remplacé le jour même, un réglage encore sans prise n'a jamais existé.
export const isLiveIn =
  (episode: readonly ReferenceSetting[], lines: readonly ReferenceLine[]) =>
  (setting: ReferenceSetting, index: number) =>
    episode[index + 1]?.startsOn !== setting.startsOn ||
    lines.some(
      (line) => line.settingId === setting.id && (isTaken(line) || line.status === 'postponed'),
    )

// R1, R10 : le réglage en vigueur un jour donné, et le jour où chacun cède la place.
export function settingsIn(live: readonly ReferenceSetting[]) {
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
