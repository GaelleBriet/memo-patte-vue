import {
  applied,
  play,
  preview,
  treatmentView,
  type Due,
  type Gesture,
  type Line,
  type TreatmentView,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'
import { shiftDayOf } from '@/shared/domain/dose-calendar/gestures/outcome'
import { referenceReading } from '@/shared/domain/dose-calendar/reference-model'

import { int, plusDays, type Random } from './carnet'
import { dueKey, gapsBetween, HORIZON_DAYS, type Display } from './display'
import { posologyFirstDue, type V2Step } from './v2-walk'

/** Un invariant de la campagne v2 (plan §6.3) qui ne tient pas, avec ce qui le montre. */
export type Broken = { invariant: string; detail: string }

const isNote = ({ status }: Pick<Line, 'status'>) =>
  status === 'given' || status === 'missed' || status === 'extra'

const horizonOf = (input: TreatmentViewInput) => plusDays(input.today, HORIZON_DAYS)
const firstDayOf = (input: TreatmentViewInput) =>
  input.settings.flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn]).sort()[0]!

function displayOf(view: TreatmentView, until: string): Display {
  const keys = (dues: Due[]) => dues.map(dueKey).sort()
  return {
    phase: view.phase,
    finished: view.finished,
    current: keys(view.currentDoses),
    unlogged: keys(view.unloggedDoses),
    upcoming: keys(view.upcoming({ to: until })),
  }
}

/** Le calendrier entier jusqu'à l'horizon (échéances et états) et l'effet de chaque ligne, sans identifiants. */
function calendarOf(view: TreatmentView, input: TreatmentViewInput, until: string): string[] {
  const slots = view
    .slots(firstDayOf(input), until)
    .map(({ due, state }) => `${dueKey(due)} ${state}`)
  const history = view.history
    .map(({ line, effect }) =>
      JSON.stringify([line.status, line.dueOn, line.dueTime, line.givenOn, line.targetOn, effect]),
    )
    .sort()
  return [...slots, ...history]
}

function compare(invariant: string, a: unknown, b: unknown): Broken | null {
  const [left, right] = [JSON.stringify(a), JSON.stringify(b)]
  return left === right
    ? null
    : { invariant, detail: `${left.slice(0, 600)}\n≠ ${right.slice(0, 600)}` }
}

/** 1. R11 : la lecture garde chaque ligne ; un geste ne touche que les lignes qu'il vise. */
export function conservation(step: V2Step): Broken | null {
  const view = treatmentView(step.after)
  if (view.history.length !== step.after.lines.length) {
    return { invariant: 'conservation', detail: 'une ligne manque à l’historique' }
  }
  if (step.gesture === null || step.outcome === null) return null
  const gesture = step.gesture
  const content = ({ settingId, dueOn, dueTime, status, givenOn, targetOn }: Line) =>
    JSON.stringify([settingId, dueOn, dueTime, status, givenOn, targetOn])
  const touched = step.outcome.changes.flatMap((change) => {
    if (change.action === 'create') return []
    const line = step.before.lines.find(({ id }) => id === change.id)!
    const now = step.after.lines.find(({ id }) => id === change.id)
    return now !== undefined && content(now) === content(line) ? [] : [line]
  })
  const becomesPrise = (line: Line) =>
    'givenOn' in gesture &&
    step.after.lines.some(
      (now) => now.id === line.id && now.status === 'given' && now.givenOn === gesture.givenOn,
    )
  const allowed = (line: Line) => {
    if (gesture.kind === 'remove') return line.id === gesture.lineId
    if (!isNote(line)) return gesture.kind !== 'note' || line.status === 'shift'
    if (becomesPrise(line)) return true
    return gesture.kind === 'redate' && line.id === gesture.lineId
  }
  const foreign = touched.filter((line) => !allowed(line))
  return foreign.length === 0
    ? null
    : { invariant: 'conservation', detail: `lignes touchées : ${JSON.stringify(foreign)}` }
}

/** 2. Pas de double : une échéance par clé, une prise par échéance, jamais deux fois la même à donner. */
export function noDouble(input: TreatmentViewInput): Broken | null {
  const view = treatmentView(input)
  const until = horizonOf(input)
  const slots = view.slots(firstDayOf(input), until).map(({ due }) => dueKey(due))
  const unlogged = view.unloggedDoses.map(dueKey)
  const ahead = [...view.currentDoses, ...view.upcoming({ to: until })].map(dueKey)
  const pending = unlogged.filter((key) => ahead.includes(key))
  const covered = view.history.flatMap(({ effect }) =>
    effect.kind === 'covers' ? [effect.key] : [],
  )
  const twice = (keys: string[]) => keys.filter((key, index) => keys.indexOf(key) !== index)
  const most = Math.max(...input.settings.map(({ times }) => Math.max(1, times.length)))
  const crowded = slots
    .map((key) => key.slice(0, 10))
    .filter((day, _, all) => all.filter((each) => each === day).length > most)
  const found = [
    ...twice(slots),
    ...twice(covered),
    ...twice(unlogged),
    ...twice(view.upcoming({ to: until }).map(dueKey)),
    ...pending,
    ...crowded,
  ]
  return found.length === 0 ? null : { invariant: 'pas de double', detail: JSON.stringify(found) }
}

/** 3. R3 : « Modifier » à fréquence et heures égales ne change pas le calendrier, sans exemption. */
export function posology(input: TreatmentViewInput): Broken | null {
  const view = treatmentView(input)
  const current = view.currentSetting
  if (current === null || view.phase === 'stopped' || view.phase === 'ended') return null
  const firstDueOn = posologyFirstDue(view, input.today)
  const posology = {
    ...current,
    id: 'posologie',
    startsOn: input.today,
    firstDueOn,
    gridOriginOn: null,
    createdAt: '9999-12-31T23:59:59.999Z',
  }
  const changed = { ...input, settings: [...input.settings, posology] }
  const until = horizonOf(input)
  const read = (carnet: TreatmentViewInput) => {
    const view = treatmentView(carnet)
    const pending = [...view.unloggedDoses, ...view.currentDoses, ...view.upcoming({ to: until })]
    const effects = view.history.map(({ line, effect }) => `${line.id} ${JSON.stringify(effect)}`)
    const keys = pending.map(dueKey).filter((key) => key.slice(0, 10) <= until)
    return [[...new Set(keys)].sort(), effects]
  }
  return compare('posologie sans effet', read(input), read(changed))
}

/** 4. Le temps ne change que les étiquettes : l'union des échéances sans prise jusqu'à un horizon fixe. */
export function time(input: TreatmentViewInput, random: Random): Broken | null {
  const until = plusDays(input.today, 60)
  const union = (today: string) => {
    const view = treatmentView({ ...input, today })
    return [
      ...new Set(
        [...view.unloggedDoses, ...view.currentDoses, ...view.upcoming({ to: until })].map(dueKey),
      ),
    ]
      .filter((key) => key.slice(0, 10) <= until)
      .sort()
  }
  const later = plusDays(input.today, int(random, 1, 30))
  return compare(`temps (${input.today} → ${later})`, union(input.today), union(later))
}

/** 5. R6 : « Fait à une autre date J » = « C'est fait » puis « Changer la date » vers J. */
export function symmetry(input: TreatmentViewInput, random: Random): Broken | null {
  const view = treatmentView(input)
  const due = view.currentDoses.find(({ dueOn }) => dueOn <= input.today)
  if (due === undefined) return null
  // Un décalage déjà posé sur la journée : la spec ne dit pas s'il appartient à la prise corrigée.
  const shiftDay = shiftDayOf(view, due)
  if (input.lines.some(({ status, dueOn }) => status === 'shift' && dueOn === shiftDay)) return null
  const givenOn = plusDays(input.today, -int(random, 0, 6))
  const boundary = view.extraBoundary(due)
  if (boundary !== null && givenOn < boundary) return null
  const checked = random() < 0.65
  const direct = play(input, {
    kind: 'note',
    due,
    status: 'given',
    givenOn,
    shiftsFollowing: checked,
  })
  const tapped = play(input, {
    kind: 'note',
    due,
    status: 'given',
    givenOn: input.today,
    shiftsFollowing: checked && givenOn === input.today,
  })
  if ('refusal' in tapped) return null
  const afterTap = applied(input, tapped.changes)
  const prise = afterTap.lines.find(
    (line) =>
      line.status === 'given' &&
      line.settingId === due.settingId &&
      dueKey(line) === dueKey(due) &&
      line.givenOn === input.today,
  )
  if (prise === undefined) return null
  const redated = play(afterTap, {
    kind: 'redate',
    lineId: prise.id,
    givenOn,
    shiftsFollowing: checked,
  })
  const label = `symétrie (${dueKey(due)} le ${givenOn}, case ${checked ? 'cochée' : 'décochée'})`
  if ('refusal' in direct || 'refusal' in redated) {
    const reasons = [
      'refusal' in direct ? direct.refusal.reason : 'accepté',
      'refusal' in redated ? redated.refusal.reason : 'accepté',
    ]
    return reasons[0] === reasons[1] ? null : { invariant: label, detail: reasons.join(' ≠ ') }
  }
  if (redated.followed.length > 0) return null
  const until = horizonOf(input)
  const read = (carnet: TreatmentViewInput) => {
    const after = treatmentView(carnet)
    return [
      displayOf(after, until),
      after
        .slots(firstDayOf(input), until)
        .map(({ due: other, state }) => `${dueKey(other)} ${state}`),
    ]
  }
  return compare(
    label,
    read(applied(input, direct.changes)),
    read(applied(afterTap, redated.changes)),
  )
}

/** 6. « Annuler » : les écritures inverses rendent la lecture d'avant. */
export function undo(step: V2Step): Broken | null {
  if (step.outcome === null) return null
  const before = new Map(step.before.lines.map((line) => [line.id, line]))
  const lines = [
    ...step.after.lines.filter((line) => before.has(line.id)).map((line) => before.get(line.id)!),
    ...step.before.lines.filter((line) => !step.after.lines.some(({ id }) => id === line.id)),
  ]
  const until = horizonOf(step.before)
  const read = (input: TreatmentViewInput) => calendarOf(treatmentView(input), input, until)
  return compare('annuler', read(step.before), read({ ...step.after, lines }))
}

/** 7. R12 : la préversion du geste est la lecture du carnet une fois écrit. */
export function previewIsResult(step: V2Step): Broken | null {
  if (step.gesture === null) return null
  const shown = preview(step.before, step.gesture as Gesture)
  if ('refusal' in shown)
    return { invariant: 'préversion', detail: `refus en préversion : ${shown.refusal.reason}` }
  const until = horizonOf(step.after)
  return compare(
    'préversion = résultat',
    [displayOf(shown, until), calendarOf(shown, step.after, until)],
    [
      displayOf(treatmentView(step.after), until),
      calendarOf(treatmentView(step.after), step.after, until),
    ],
  )
}

/** 8. Le moteur v2 lit comme le modèle de référence naïf, à chaque pas. */
export function naive(input: TreatmentViewInput): Broken | null {
  const until = horizonOf(input)
  const reference = referenceReading({ ...input, until })
  const v2 = displayOf(treatmentView(input), until)
  const gaps = gapsBetween(reference, v2)
  return gaps.length === 0
    ? null
    : { invariant: 'modèle naïf', detail: JSON.stringify(gaps).slice(0, 800) }
}

/** Les huit invariants sur un pas joué ; le premier qui ne tient pas. */
export function brokenBy(step: V2Step, random: Random): Broken | null {
  const checks = [
    () => conservation(step),
    () => noDouble(step.after),
    () => posology(step.after),
    () => time(step.after, random),
    () => symmetry(step.after, random),
    () => undo(step),
    () => previewIsResult(step),
    () => naive(step.after),
  ]
  for (const check of checks) {
    const broken = check()
    if (broken !== null) return broken
  }
  return null
}
