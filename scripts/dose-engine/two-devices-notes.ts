import {
  treatmentView,
  type play,
  type Due,
  type Line,
  type LineChange,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'

import { int, mulberry32, pick, plusDays, type Random } from './carnet'
import { applyBatch, noteByApp, type Clock, type Phone } from './two-devices-app'
import { startV2Walk, v2Step } from './v2-walk'

/** Un moteur qui joue les gestes et lit le carnet : celui de la branche, ou celui de `main`. */
export type Engine = { play: typeof play; treatmentView: typeof treatmentView }

type Device = 'A' | 'B'
type Note = { status: 'given' | 'missed'; givenOn: string }

/**
 * Une fourche de notes (#931) : la même dose notée sur A et sur B, chacun sans voir l'autre, puis un
 * geste de note sur la même dose sur l'un d'eux, l'autre ligne reçue avant ou après lui.
 */
export type NotesFork = {
  seed: number
  step: number
  base: TreatmentViewInput
  due: Due
  first: Device
  notes: Record<Device, Note>
  device: Device
  gesture: Note
}

const LATER = Date.UTC(2027, 5, 1)

function stamp(clock: { n: number }): string {
  clock.n += 1
  return new Date(LATER + clock.n * 1000).toISOString()
}

// Comme le repository : une réécriture garde l'identifiant et le téléphone qui a créé la ligne.
function write(
  lines: readonly Line[],
  changes: readonly LineChange[],
  device: Device,
  clock: { n: number },
): Line[] {
  let next = [...lines]
  for (const change of changes) {
    if (change.action === 'delete') {
      next = next.filter(({ id }) => id !== change.id)
      continue
    }
    const updatedAt = stamp(clock)
    next =
      change.action === 'rewrite'
        ? next.map((line) =>
            line.id === change.id ? { ...line, ...change.line, updatedAt } : line,
          )
        : [
            ...next,
            { ...change.line, id: `${device}${clock.n}`, updatedAt, createdByDevice: device },
          ]
  }
  return next
}

// La synchro : par ligne, la modification la plus récente gagne ; une ligne supprimée l'est partout.
function synced(base: readonly Line[], a: readonly Line[], b: readonly Line[]): Line[] {
  const byId = new Map<string, Line>()
  for (const line of [...a, ...b]) {
    const kept = byId.get(line.id)
    if (kept === undefined || line.updatedAt > kept.updatedAt) byId.set(line.id, line)
  }
  const gone = (id: string) => !a.some((l) => l.id === id) || !b.some((l) => l.id === id)
  const removed = new Set(base.map(({ id }) => id).filter(gone))
  return [...byId.values()].filter(({ id }) => !removed.has(id))
}

const gestureOf = (due: Due, note: Note) =>
  ({
    kind: 'note',
    due,
    status: note.status,
    givenOn: note.givenOn,
    shiftsFollowing: false,
  }) as const

function noted(engine: Engine, input: TreatmentViewInput, fork: NotesFork, note: Note) {
  const result = engine.play(input, gestureOf(fork.due, note))
  return 'refusal' in result ? null : result.changes
}

// Ce que l'écran montre, sans les identifiants des lignes.
function signature(engine: Engine, input: TreatmentViewInput): string {
  const view = engine.treatmentView(input)
  const history = view.history
    .map(
      ({ line, effect }) =>
        `${line.dueOn} ${line.dueTime} ${line.status} ${line.givenOn} ${effect.kind}`,
    )
    .sort()
  const next = view.currentDoses.map(({ dueOn, dueTime }) => `${dueOn} ${dueTime}`)
  return JSON.stringify({ history, next, nextDue: view.nextDue })
}

/**
 * Ce que montrent les deux téléphones après la synchro, l'autre ligne reçue avant le geste puis après
 * lui ; `null` quand une note de départ est refusée.
 */
export function screensOf(engine: Engine, fork: NotesFork): [string, string] | null {
  const clock = { n: 0 }
  const other: Device = fork.device === 'A' ? 'B' : 'A'
  const phones = {} as Record<Device, Line[]>
  for (const device of [fork.first, fork.first === 'A' ? 'B' : 'A'] as const) {
    const input = { ...fork.base, device }
    const changes = noted(engine, input, fork, fork.notes[device])
    if (changes === null) return null
    phones[device] = write(fork.base.lines, changes, device, clock)
  }
  const at = clock.n
  const screens = [true, false].map((receivedBefore) => {
    clock.n = at
    const lines = receivedBefore
      ? synced(fork.base.lines, phones[fork.device], phones[other])
      : phones[fork.device]
    const input = { ...fork.base, lines, device: fork.device }
    const changes = noted(engine, input, fork, fork.gesture)
    if (changes === null) return 'refusé'
    const after = write(lines, changes, fork.device, clock)
    const merged = synced(fork.base.lines, after, phones[other])
    return signature(engine, { ...fork.base, lines: merged })
  })
  return [screens[0]!, screens[1]!]
}

const otherOf = (device: Device): Device => (device === 'A' ? 'B' : 'A')

function slotOf(fork: NotesFork, lines: readonly Line[]) {
  const { dueOn, dueTime } = fork.due
  return treatmentView({ ...fork.base, lines })
    .slots(dueOn, dueOn)
    .find(({ due }) => due.dueTime === dueTime)
}

// Le geste n'est proposé que sur une dose à renseigner ou notée autrement (#920, R12).
const offered = (fork: NotesFork, lines: readonly Line[]) =>
  ['pending', fork.gesture.status === 'given' ? 'missed' : 'given'].includes(
    slotOf(fork, lines)?.state ?? '',
  )

// La ligne qui couvre la dose porte le statut et la date du geste.
function showsGesture(fork: NotesFork, lines: readonly Line[]): boolean {
  const slot = slotOf(fork, lines)
  if (slot?.state !== fork.gesture.status) return false
  return fork.gesture.status === 'missed' || slot.by?.givenOn === fork.gesture.givenOn
}

const copyOf = (phone: Phone): Phone => ({
  device: phone.device,
  lines: [...phone.lines],
  deleted: new Map(phone.deleted),
})

/**
 * Les constats d'une fourche jouée comme par l'app (écritures du service, réécritures inchangées
 * sautées, « Annuler ») : la dose montre le geste, « Annuler » rend la fiche d'avant, les deux ordres
 * donnent le même écran ; `null` quand une note de départ est refusée.
 */
export function appConstatsOf(engine: Engine, fork: NotesFork): string[] | null {
  const clock: Clock = { n: 0 }
  const start = (device: Device): Phone => ({
    device,
    lines: [...fork.base.lines],
    deleted: new Map(),
  })
  const phones = { A: start('A'), B: start('B') }
  for (const device of [fork.first, otherOf(fork.first)]) {
    const note = gestureOf(fork.due, fork.notes[device])
    const done = noteByApp(phones[device], fork.base, note, clock)
    if (done === null || done.change.alreadyGivenOn !== null) return null
  }
  const other = phones[otherOf(fork.device)]
  const screen = (lines: readonly Line[]) => signature(engine, { ...fork.base, lines })
  const where = `graine ${fork.seed}, pas ${fork.step}`
  const found: string[] = []
  const at = clock.n
  const screens = [true, false].map((receivedBefore) => {
    clock.n = at
    const mine = phones[fork.device]
    const phone: Phone = {
      ...copyOf(mine),
      lines: receivedBefore ? synced(fork.base.lines, mine.lines, other.lines) : [...mine.lines],
    }
    if (!offered(fork, phone.lines)) return null
    const order = receivedBefore ? 'ligne de l’autre reçue avant' : 'reçue après'
    const before = screen(phone.lines)
    const done = noteByApp(phone, fork.base, gestureOf(fork.due, fork.gesture), clock)
    if (done === null) return 'refusé'
    if (!showsGesture(fork, phone.lines)) found.push(`${where}, ${order} : dose sans le geste`)
    const undone = copyOf(phone)
    try {
      applyBatch(undone, done.undo, { n: clock.n })
      if (screen(undone.lines) !== before) found.push(`${where}, ${order} : « Annuler » rate`)
    } catch {
      found.push(`${where}, ${order} : « Annuler » refusé`)
    }
    const merged = synced(fork.base.lines, phone.lines, other.lines)
    if (!showsGesture(fork, merged)) found.push(`${where}, ${order} : synchro sans le geste`)
    return screen(merged)
  })
  if (screens.every((each) => each !== null) && screens[0] !== screens[1]) {
    found.push(`${where} : écran selon l'ordre de synchro`)
  }
  return found
}

function noteOf(random: Random, due: Due, today: string, given: number): Note {
  const span = Math.round((Date.parse(today) - Date.parse(due.dueOn)) / 864e5)
  const status = random() < given ? 'given' : 'missed'
  return {
    status,
    givenOn: status === 'missed' ? due.dueOn : plusDays(due.dueOn, int(random, 0, span)),
  }
}

function forkAt(seed: number, step: number, base: TreatmentViewInput, random: Random) {
  const view = treatmentView(base)
  const past = [...view.unloggedDoses, ...view.currentDoses].filter(
    ({ dueOn }) => dueOn <= base.today,
  )
  const due = pick(random, past)
  if (due === undefined) return null
  const first: Device = random() < 0.5 ? 'A' : 'B'
  const notes = { A: noteOf(random, due, base.today, 0.7), B: noteOf(random, due, base.today, 0.7) }
  const device: Device = random() < 0.5 ? 'A' : 'B'
  const gesture = noteOf(random, due, base.today, 0.4)
  return { seed, step, base, due, first, notes, device, gesture }
}

/** Les fourches de notes d'un carnet mené par les gestes de v2, une chance sur deux et demie par pas. */
export function notesForksOf(seed: number, steps: number, onFork: (fork: NotesFork) => void): void {
  const walk = startV2Walk(seed)
  const random = mulberry32(seed ^ 0x3c6ef372)
  for (let step = 0; step < steps; step += 1) {
    v2Step(walk, () => {})
    if (random() > 0.4) continue
    const fork = forkAt(seed, step, walk.input, random)
    if (fork !== null) onFork(fork)
  }
}
