import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'

import { daysBetween, idOf, int, pick, plusDays } from './carnet'
import { refusedByV2, v2, v2Due } from './walk-filter'
import { afterMove, applied, unchecks, WalkStopped, type Walk } from './walk-state'

function playMove(walk: Walk, gesture: string, due: Due, to: string, shiftsFollowing: boolean) {
  const next = movedOrStop(walk, due, to, shiftsFollowing)
  const play = [
    (input: Parameters<typeof v2.moveDose>[0]) =>
      v2.moveDose(input, { due: v2Due(due), to, shiftsFollowing }),
  ]
  if (refusedByV2(walk, gesture, next, play)) return
  walk.log.push(gesture)
  walk.book = next
}

function movedOrStop(walk: Walk, due: Due, to: string, shiftsFollowing = true) {
  try {
    return afterMove(walk, due, to, shiftsFollowing)
  } catch (error) {
    throw new WalkStopped(`${walk.book.today} déplacer ${idOf(due)} au ${to} : ${String(error)}`)
  }
}

// « Prochaine dose » : la dose du moment ou la suivante, avec son décalage ou seule.
export function move(walk: Walk, before: TreatmentSchedule): void {
  const [current] = before.currentDoses
  const due = pick(
    walk.random,
    [current, current, current, before.nextDue].filter(
      (item) => item !== null && item !== undefined,
    ),
  )
  if (due === undefined) return
  if (before.moveBounds(due) !== null && unchecks(walk)) return moveAlone(walk, before, due)
  const bounds = before.moveBounds(due)
  if (bounds === null) return
  const { earliest, latest } = bounds
  const last = latest ?? plusDays(earliest, int(walk.random, 0, 12))
  if (last < earliest) return
  const dates = [
    earliest,
    last,
    plusDays(earliest, int(walk.random, 0, daysBetween(earliest, last))),
  ]
  // La campagne essaie les trois dates : leurs écritures avancent les tampons comme chez elle.
  for (const to of dates) movedOrStop(walk, due, to)
  const to = dates[2] ?? earliest
  playMove(walk, `${walk.book.today} déplacer ${idOf(due)} au ${to}`, due, to, true)
}

function moveAlone(walk: Walk, before: TreatmentSchedule, due: Due): void {
  const bounds = before.moveBounds(due, false)
  if (bounds === null) return
  const { earliest, latest } = bounds
  if (latest === null) throw new WalkStopped(`report seul de ${idOf(due)} : aucune borne haute`)
  const to = plusDays(earliest, int(walk.boxRandom, 0, daysBetween(earliest, latest)))
  playMove(walk, `${walk.book.today} déplacer seule ${idOf(due)} au ${to}`, due, to, false)
}

export function unmove(walk: Walk, before: TreatmentSchedule): void {
  const line = pick(
    walk.random,
    before.doses.filter(({ status }) => status === 'postponed'),
  )
  if (line === undefined) return
  try {
    before.removeMove(line.id)
  } catch {
    return
  }
  const gesture = `${walk.book.today} supprimer le déplacement ${idOf(line)}`
  const next = { ...walk.book, doses: walk.book.doses.filter(({ id }) => id !== line.id) }
  if (refusedByV2(walk, gesture, next, [(input) => v2.removeLine(input, line.id)])) return
  walk.log.push(gesture)
  walk.book = next
}

export function unshift(walk: Walk, before: TreatmentSchedule): void {
  const line = pick(
    walk.shiftRandom,
    before.doses.filter((dose) => dose.status === 'shift'),
  )
  if (line === undefined || before.shiftRemovalRefusal(line.id) !== null) return
  const gesture = `${walk.book.today} supprimer le décalage ${idOf(line)}`
  const next = applied(walk, walk.book, before.removeShift(line.id))
  if (refusedByV2(walk, gesture, next, [(input) => v2.removeLine(input, line.id)])) return
  walk.log.push(gesture)
  walk.book = next
}
