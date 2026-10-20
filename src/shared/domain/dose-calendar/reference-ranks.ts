import type { Hour } from './reference-grid'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

/** Ce qu'un report prend à une journée par rang : ce qu'elle perd, et les heures qu'il emmène en plus de la sienne. */
export type ByRank = { lost: Hour[]; alsoCarried: Hour[] }

// Q4 : le rang écrit sur la ligne, sinon la place de l'heure du report parmi les heures de la journée.
function rankIn(report: ReferenceLine, hours: readonly Hour[]): number {
  if (typeof report.dueRank === 'number') return report.dueRank
  let rank = 1
  for (const hour of hours) {
    if (hour !== null && report.dueTime !== null && hour < report.dueTime) rank += 1
  }
  return rank
}

/**
 * Q4, Q5 : la journée perd la dose de rang du report si elle est libre ; avec « Décaler aussi les
 * doses suivantes », chaque dose libre de rang plus grand part aussi, à son heure.
 */
export function takenByRank(
  report: ReferenceLine,
  hours: readonly Hour[],
  covered: ReadonlySet<Hour>,
  withFollowing: boolean,
): ByRank {
  const ordered = hours.slice().sort((a, b) => (a ?? '').localeCompare(b ?? ''))
  const rank = rankIn(report, ordered)
  const lost: Hour[] = []
  const alsoCarried: Hour[] = []
  ordered.forEach((hour, index) => {
    if (covered.has(hour)) return
    if (index + 1 === rank) lost.push(hour)
    if (withFollowing && index + 1 > rank) {
      lost.push(hour)
      alsoCarried.push(hour)
    }
  })
  return { lost, alsoCarried }
}

/** Q1 : l'ancienne arrivée d'un report, quand elle est la date choisie d'un réglage. */
export function chosenDayOf(
  report: ReferenceLine,
  settingAt: (day: string) => ReferenceSetting | undefined,
  live: readonly ReferenceSetting[],
): string | undefined {
  const day = report.previousTargetOn ?? null
  if (day === null || day === report.targetOn) return undefined
  const setting = settingAt(day)
  if (setting === undefined) return undefined
  if (setting.firstDueChosen && setting.firstDueOn === day) return day
  // R3 : un réglage suivant de même fréquence, sans origine à lui, garde la date choisie avant lui.
  const keeps = (earlier: ReferenceSetting) =>
    earlier.createdAt < setting.createdAt &&
    earlier.firstDueChosen &&
    earlier.firstDueOn === day &&
    earlier.frequency.value === setting.frequency.value &&
    earlier.frequency.unit === setting.frequency.unit
  return setting.gridOriginOn === null && live.some(keeps) ? day : undefined
}
