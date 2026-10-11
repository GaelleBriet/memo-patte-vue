import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'

import { idOf, int, isNote, pick, plusDays } from './carnet'
import { bothBoxes, refusedByV2, v2, v2Due } from './walk-filter'
import { applied, stampOf, unchecks, WalkStopped, written, type Walk } from './walk-state'

function refusedBy(gesture: () => unknown): boolean {
  try {
    gesture()
    return false
  } catch {
    return true
  }
}

export function note(
  walk: Walk,
  before: TreatmentSchedule,
  due: Due,
  kind: 'given' | 'missed',
  givenOn: string,
  shiftsFollowing?: boolean,
): void {
  const box = shiftsFollowing === false ? ', case décochée' : ''
  const gesture = `${walk.book.today} ${kind} ${idOf(due)} le ${givenOn}${box}`
  let noted
  try {
    noted =
      kind === 'given'
        ? before.doseFor({ kind, due, givenOn, shiftsFollowing })
        : before.doseFor({ kind, due })
  } catch (error) {
    walk.log.push(gesture)
    throw new WalkStopped(`${gesture} : ${String(error)}`)
  }
  const shifted = noted.shift === null ? walk.book : written(walk, walk.book, noted.shift)
  const next = written(walk, shifted, noted.dose)
  const plays = bothBoxes(
    (shiftsFollowing) => (input) =>
      v2.noteDose(input, { due: v2Due(due), status: kind, givenOn, shiftsFollowing }),
  )
  if (refusedByV2(walk, gesture, next, plays)) return
  walk.log.push(gesture)
  walk.book = next
}

export function give(walk: Walk, before: TreatmentSchedule): void {
  const due = pick(walk.random, before.currentDoses)
  if (due === undefined) return
  const late = due.dueOn < walk.book.today && walk.random() < 0.5
  note(walk, before, due, 'given', late ? due.dueOn : walk.book.today)
}

export function miss(walk: Walk, before: TreatmentSchedule): void {
  const due = pick(walk.random, before.currentDoses)
  if (due !== undefined && due.dueOn <= walk.book.today) {
    note(walk, before, due, 'missed', due.dueOn)
  }
}

export function logUnlogged(walk: Walk, before: TreatmentSchedule): void {
  const due = pick(walk.random, before.unloggedDoses)
  if (due === undefined) return
  note(walk, before, due, walk.random() < 0.7 ? 'given' : 'missed', due.dueOn)
}

export function otherDate(walk: Walk, before: TreatmentSchedule): void {
  const { today } = walk.book
  const givenOn = plusDays(today, -int(walk.random, 0, 8))
  const time = pick(walk.random, walk.book.periods.at(-1)?.times ?? []) ?? null
  let due: Due | null
  try {
    due = before.dueForDate(givenOn, time)
  } catch (error) {
    throw new WalkStopped(`${today} viser une prise le ${givenOn} : ${String(error)}`)
  }
  const isNoted = before.doses.some((dose) => due !== null && idOf(dose) === idOf(due))
  if (due === null || isNoted) return
  if (!before.offersShift(due, givenOn)) return note(walk, before, due, 'given', givenOn)
  const checked = !unchecks(walk)
  if (checked && before.noteRefusal(due, givenOn) !== null) return
  note(walk, before, due, 'given', givenOn, checked)
}

// « C'est fait » sur une dose à venir, aujourd'hui ou la veille : une prise en plus si elle est assez loin.
export function ahead(walk: Walk, before: TreatmentSchedule): void {
  const [current] = before.currentDoses
  if (current === undefined || current.dueOn <= walk.book.today) return
  const givenOn = plusDays(walk.book.today, -int(walk.extraRandom, 0, 1))
  if (givenOn >= current.dueOn) return
  let target: Due | null
  try {
    target = givenOn === walk.book.today ? current : before.dueForDate(givenOn, current.dueTime)
  } catch (error) {
    throw new WalkStopped(`${walk.book.today} viser une prise le ${givenOn} : ${String(error)}`)
  }
  if (target === null) return
  const isNoted = before.doses.some((dose) => isNote(dose) && idOf(dose) === idOf(target))
  if (!isNoted) note(walk, before, target, 'given', givenOn)
}

export function redateExtra(walk: Walk, before: TreatmentSchedule): void {
  const extra = pick(
    walk.extraRandom,
    before.doses.filter(({ status }) => status === 'extra'),
  )
  if (extra === undefined) return
  const givenOn = plusDays(walk.book.today, -int(walk.extraRandom, 0, 6))
  if (before.redateLimits(extra.id).takenDays.includes(givenOn)) return
  const gesture = `${walk.book.today} redater la prise en plus ${idOf(extra)} au ${givenOn}`
  let redated
  try {
    redated = before.redate(extra.id, givenOn)
  } catch (error) {
    walk.log.push(gesture)
    throw new WalkStopped(`${gesture} : ${String(error)}`)
  }
  const book = { ...walk.book, doses: walk.book.doses.filter(({ id }) => id !== extra.id) }
  const next = written(walk, applied(walk, book, redated.shift), redated.dose)
  const plays = bothBoxes(
    (shiftsFollowing) => (input) =>
      v2.redateDose(input, { lineId: extra.id, givenOn, shiftsFollowing }),
  )
  if (refusedByV2(walk, gesture, next, plays)) return
  walk.log.push(gesture)
  walk.book = next
}

export function deleteExtra(walk: Walk, before: TreatmentSchedule): void {
  const extra = pick(
    walk.extraRandom,
    before.doses.filter(({ status }) => status === 'extra'),
  )
  if (extra === undefined) return
  const gesture = `${walk.book.today} supprimer la prise en plus ${idOf(extra)}`
  const next = { ...walk.book, doses: walk.book.doses.filter(({ id }) => id !== extra.id) }
  if (refusedByV2(walk, gesture, next, [(input) => v2.removeLine(input, extra.id)])) return
  walk.log.push(gesture)
  walk.book = next
}

export function deleteNote(walk: Walk, before: TreatmentSchedule): void {
  const line = pick(walk.random, before.doses.filter(isNote))
  if (line === undefined) return
  const gesture = `${walk.book.today} supprimer la prise ${idOf(line)}`
  const next = { ...walk.book, doses: walk.book.doses.filter(({ id }) => id !== line.id) }
  if (refusedByV2(walk, gesture, next, [(input) => v2.removeLine(input, line.id)])) return
  walk.log.push(gesture)
  walk.book = next
}

export function redate(walk: Walk, before: TreatmentSchedule): void {
  const dose = pick(
    walk.random,
    before.doses.filter(({ status }) => status === 'given'),
  )
  if (dose === undefined) return
  const givenOn = plusDays(walk.book.today, -int(walk.random, 0, 6))
  const { lastExtraDay } = before.redateLimits(dose.id)
  if (lastExtraDay !== null && givenOn <= lastExtraDay) return
  const unchecked = before.redateOffersShift(dose.id, givenOn) && unchecks(walk)
  if (before.redateRefusal(dose.id, givenOn, !unchecked) !== null) {
    if (!refusedBy(() => before.redate(dose.id, givenOn, !unchecked))) {
      throw new WalkStopped(`${walk.book.today} redater ${idOf(dose)} : refusé mais accepté`)
    }
    return
  }
  const box = unchecked ? ', case décochée' : ''
  const gesture = `${walk.book.today} redater ${idOf(dose)} au ${givenOn}${box}`
  const { dose: fields, shift, postponement } = before.redate(dose.id, givenOn, !unchecked)
  const dropped = postponement?.kept === false ? postponement.doseIds : []
  const at = stampOf(walk)
  const doses = walk.book.doses
    .filter(({ id }) => !dropped.includes(id))
    .map((line) => {
      if (line.id === dose.id) return { ...line, ...fields, updatedAt: at }
      if (postponement?.kept !== true) return line
      if (postponement.doseIds.includes(line.id)) {
        return { ...line, ...postponement.line, updatedAt: at }
      }
      return postponement.shiftIds.includes(line.id)
        ? { ...line, ...postponement.shiftLine, updatedAt: at }
        : line
    })
  const next = applied(walk, { ...walk.book, doses }, shift)
  const plays = [!unchecked, unchecked].map(
    (shiftsFollowing) => (input: Parameters<typeof v2.redateDose>[0]) =>
      v2.redateDose(input, { lineId: dose.id, givenOn, shiftsFollowing }),
  )
  if (refusedByV2(walk, gesture, next, plays)) return
  walk.log.push(gesture)
  walk.book = next
}
