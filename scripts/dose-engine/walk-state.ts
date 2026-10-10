import {
  treatmentSchedule,
  type DoseFields,
  type Due,
  type LineChange,
  type TreatmentDoseInput,
  type TreatmentSchedule,
} from '@/shared/domain/treatment-schedule'

import {
  familyOf,
  idOf,
  int,
  mulberry32,
  newBook,
  withCloseEnd,
  type Book,
  type Random,
} from './carnet'

/** `sans` : un seul réglage, ni « Modifier » ni « Reprendre » ; `avec` : les gestes de la campagne. */
export type SettingsMode = 'avec' | 'sans'

/** Un carnet de la campagne d'invariants, mené par le moteur actuel comme l'app le mène. */
export type Walk = {
  book: Book
  /** Lignes que le moteur actuel a fait purger : le moteur v2 les garde (R11). */
  readonly purged: TreatmentDoseInput[]
  stamp: number
  readonly log: string[]
  readonly seed: number
  readonly settings: SettingsMode
  readonly random: Random
  readonly shiftRandom: Random
  readonly extraRandom: Random
  readonly boxRandom: Random
  readonly rhythmRandom: Random
}

export class WalkStopped extends Error {}

export function startWalk(seed: number, settings: SettingsMode): Walk {
  const random = mulberry32(seed)
  const book = newBook(random)
  const endRandom = mulberry32(seed ^ 0x68e31da4)
  return {
    book: endRandom() < 0.2 ? withCloseEnd(book, int(endRandom, 1, 2)) : book,
    purged: [],
    stamp: 0,
    log: [],
    seed,
    settings,
    random,
    shiftRandom: mulberry32(seed ^ 0x5f3759df),
    extraRandom: mulberry32(seed ^ 0x2545f491),
    boxRandom: mulberry32(seed ^ 0x1b873593),
    rhythmRandom: mulberry32(seed ^ 0x3c6ef372),
  }
}

/** Le carnet tel que les deux moteurs le lisent : rien n'en a été purgé. */
export function keptBook(walk: Walk): Book {
  return walk.purged.length === 0
    ? walk.book
    : { ...walk.book, doses: [...walk.book.doses, ...walk.purged] }
}

export function stampOf(walk: Walk): string {
  walk.stamp += 1
  return new Date(Date.UTC(2026, 0, 1, 0, 0, walk.stamp)).toISOString()
}

export function scheduleOf(walk: Walk, book = walk.book): TreatmentSchedule {
  try {
    return treatmentSchedule(book)
  } catch (error) {
    throw new WalkStopped(`le moteur actuel lève : ${String(error)}`)
  }
}

export function unchecks(walk: Walk): boolean {
  return walk.boxRandom() < 0.35
}

// Comme le repository : une ligne par échéance et par famille, réécrite si elle existe déjà.
export function written(walk: Walk, book: Book, fields: DoseFields): Book {
  const at = stampOf(walk)
  const existing = book.doses.find(
    (dose) => idOf(dose) === idOf(fields) && familyOf(dose) === familyOf(fields),
  )
  const doses = existing
    ? book.doses.map((dose) => (dose === existing ? { ...dose, ...fields, updatedAt: at } : dose))
    : [...book.doses, { id: `d${walk.stamp}`, ...fields, createdAt: at, updatedAt: at }]
  return { ...book, doses }
}

export function applied(walk: Walk, book: Book, change: LineChange): Book {
  switch (change.action) {
    case 'none':
      return book
    case 'create':
      return written(walk, book, change.dose)
    case 'delete':
      return { ...book, doses: book.doses.filter(({ id }) => id !== change.doseId) }
    case 'rewrite': {
      const at = stampOf(walk)
      const doses = book.doses.map((line) =>
        line.id === change.doseId ? { ...line, ...change.dose, updatedAt: at } : line,
      )
      return { ...book, doses }
    }
  }
}

export function afterMove(walk: Walk, due: Due, to: string, shiftsFollowing = true): Book {
  const { report, shift } = scheduleOf(walk).move(due, to, shiftsFollowing)
  return applied(walk, applied(walk, walk.book, shift), report)
}

// La campagne date « Annuler » d'un tampon : le même pas garde les mêmes identifiants qu'elle.
export function undoStamp(walk: Walk, start: Book): void {
  if (walk.book.doses !== start.doses && walk.book.today === start.today) stampOf(walk)
}

export function attempt<T>(gesture: () => T): T | undefined {
  try {
    return gesture()
  } catch (error) {
    if (error instanceof WalkStopped) throw error
    return undefined
  }
}
