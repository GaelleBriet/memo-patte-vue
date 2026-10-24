import type { Hour } from './reference-grid'
import type { ReferenceLine, ReferenceSetting } from './reference-types'

/**
 * Ce qu'un report prend à une journée par rang : ce qu'elle perd, les heures qu'il emmène en plus de la
 * sienne, et toutes celles qui arrivent.
 */
export type ByRank = { lost: Hour[]; alsoCarried: Hour[]; carried: Hour[] }

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
  return { lost, alsoCarried, carried: landing(report, ordered[rank - 1], alsoCarried) }
}

/** G13, R9 : la journée entière d'une date choisie, que sa dose avancée avec la case emmène. */
export function wholeDayOf(report: ReferenceLine, hours: readonly Hour[]): Hour[] {
  const ordered = hours.slice().sort((a, b) => (a ?? '').localeCompare(b ?? ''))
  const rank = rankIn(report, ordered)
  return landing(
    report,
    ordered[rank - 1],
    ordered.filter((_, index) => index + 1 !== rank),
  )
}

// Q3, Q-b : à son heure écrite, ou à celle de son rang quand une dose qui l'accompagne y arrive déjà
// ou que l'heure écrite est vide dans une journée à heures.
function landing(
  report: ReferenceLine,
  ownHour: Hour | undefined,
  joining: readonly Hour[],
): Hour[] {
  const blocked = joining.includes(report.dueTime) || (report.dueTime === null && ownHour !== null)
  const at = blocked && ownHour !== undefined ? ownHour : report.dueTime
  return [...new Set([at, ...joining])].sort()
}

/**
 * Q1 : le réglage dont la date choisie était l'ancienne arrivée d'un report, quand le report est plus
 * récent que le « Modifier » qui l'a choisie (Q26, Q40).
 */
export function chooserOf(
  report: ReferenceLine,
  settingAt: (day: string) => ReferenceSetting | undefined,
  live: readonly ReferenceSetting[],
): ReferenceSetting | undefined {
  const day = report.previousTargetOn ?? null
  if (day === null || day === report.targetOn) return undefined
  const inForce = settingAt(day)
  if (inForce === undefined) return undefined
  // R3 : la grille du jour est celle du dernier réglage qui a posé sa propre origine, que les réglages
  // suivants de même fréquence, sans origine à eux, continuent.
  const before = live.slice(0, live.indexOf(inForce) + 1).reverse()
  const sameRhythm = (a: ReferenceSetting) =>
    a.frequency.value === inForce.frequency.value && a.frequency.unit === inForce.frequency.unit
  const drawer = before.find((each) => each.gridOriginOn !== null || !sameRhythm(each))
  if (drawer === undefined || !sameRhythm(drawer)) return undefined
  const continued = before.slice(0, before.indexOf(drawer)).every(sameRhythm)
  if (!continued || !drawer.firstDueChosen || drawer.firstDueOn !== day) return undefined
  return report.decidedAt > (drawer.updatedAt ?? drawer.createdAt) ? drawer : undefined
}
