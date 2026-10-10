import { int, pick, plusDays, type Book } from './carnet'
import {
  deleteExtra,
  deleteNote,
  give,
  logUnlogged,
  miss,
  otherDate,
  redate,
  redateExtra,
  ahead,
} from './walk-notes'
import { move, unmove, unshift } from './walk-moves'
import { newPeriod, resume, stop } from './walk-settings'
import { keptBook, scheduleOf, undoStamp, type Walk } from './walk-state'

const GESTURES = [
  'give',
  'give',
  'miss',
  'log',
  'otherDate',
  'move',
  'move',
  'redate',
  'delete',
  'newPeriod',
  'stop',
  'resume',
  'resume',
  'unmove',
  'wait',
  'wait',
] as const

/** Appelé après chaque geste qui a changé le carnet, avec le carnet lu juste avant ce geste. */
export type GestureHook = (before: Book) => void

function mainGesture(walk: Walk): void {
  const before = scheduleOf(walk)
  const { today } = walk.book
  const settingsChange = walk.settings === 'avec'
  switch (pick(walk.random, GESTURES)) {
    case 'give':
      return give(walk, before)
    case 'miss':
      return miss(walk, before)
    case 'delete':
      return deleteNote(walk, before)
    case 'stop':
      if (walk.random() < 0.3) stop(walk)
      return
    case 'resume':
      if (settingsChange) resume(walk, before)
      return
    case 'log':
      return logUnlogged(walk, before)
    case 'otherDate':
      return otherDate(walk, before)
    case 'move':
      return move(walk, before)
    case 'redate':
      return redate(walk, before)
    case 'newPeriod':
      if (settingsChange) newPeriod(walk, before)
      return
    case 'unmove':
      return unmove(walk, before)
    default:
      walk.log.push(`${today} attendre`)
      walk.book = { ...walk.book, today: plusDays(today, int(walk.random, 1, 4)) }
  }
}

function extraGesture(walk: Walk): void {
  const draw = walk.extraRandom()
  if (draw < 0.1) ahead(walk, scheduleOf(walk))
  else if (draw < 0.13) redateExtra(walk, scheduleOf(walk))
  else if (draw < 0.15) deleteExtra(walk, scheduleOf(walk))
}

// Comme le repository : les déplacements sans effet partent avec l'écriture.
function purgeStale(walk: Walk): void {
  const stale = scheduleOf(walk).staleDoseIds
  if (stale.length === 0) return
  walk.purged.push(...walk.book.doses.filter(({ id }) => stale.includes(id)))
  walk.book = { ...walk.book, doses: walk.book.doses.filter(({ id }) => !stale.includes(id)) }
}

function played(walk: Walk, gesture: () => void, onGesture: GestureHook): void {
  const start = walk.book
  const read = keptBook(walk)
  gesture()
  if (walk.book !== start) onGesture(read)
}

/** Un pas de la campagne : décalage supprimé parfois, prise en plus parfois, puis un geste tiré au sort. */
export function step(walk: Walk, onGesture: GestureHook): void {
  const unshifted = walk.book
  played(
    walk,
    () => {
      if (walk.shiftRandom() < 0.08) unshift(walk, scheduleOf(walk))
    },
    onGesture,
  )
  undoStamp(walk, unshifted)
  const extraFrom = walk.book
  played(walk, () => extraGesture(walk), onGesture)
  undoStamp(walk, extraFrom)
  const start = walk.book
  played(
    walk,
    () => {
      mainGesture(walk)
      if (walk.book.periods === start.periods) undoStamp(walk, start)
      purgeStale(walk)
    },
    onGesture,
  )
}
