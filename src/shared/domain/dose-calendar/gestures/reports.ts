import { keyOf, later, longestStep, plusDays, stepped } from '../grid'
import { episodeIdsOf } from '../settings'
import type { Day, Line, LineChange, LineEffect, Setting, TreatmentViewInput } from '../types'
import { buildView, type TreatmentView } from '../view'
import { without } from './changes'

const shiftDays = (view: TreatmentView): Set<Day> =>
  new Set(view.history.flatMap(({ effect }) => (effect.kind === 'shifts' ? [effect.from] : [])))

/** Les reports seuls (sans décalage sur leur journée) qui déplacent une dose, après ce jour. */
export function loneReports(view: TreatmentView, after: Day): Line[] {
  const shifted = shiftDays(view)
  return view.history
    .filter(
      ({ line, effect }) =>
        line.status === 'postponed' &&
        effect.kind === 'moves' &&
        line.dueOn > after &&
        !shifted.has(line.dueOn),
    )
    .map(({ line }) => line)
}

const horizonOf = (input: TreatmentViewInput, from: Day) =>
  plusDays(from, 2 * Math.max(1, ...input.settings.map(({ frequency }) => longestStep(frequency))))

/**
 * R7, Q2 a : un report seul tient quand son échéance d'origine est dans le calendrier et qu'il arrive
 * après la journée d'échéance précédente et avant la suivante.
 */
export function reportHolds(input: TreatmentViewInput, report: Line): boolean {
  const arriving = input.lines.filter(
    (line) =>
      (line.status === 'given' || line.status === 'missed') && line.dueOn === report.targetOn,
  )
  const rest = buildView(without(input, [report.id, ...arriving.map(({ id }) => id)]))
  if (rest.dueState(report) !== 'pending') return false
  const arrival = report.targetOn!
  if (arrival > report.dueOn) {
    const next = rest.slots(plusDays(report.dueOn, 1), horizonOf(input, arrival))[0]
    return next === undefined || arrival < next.due.dueOn
  }
  const first = input.settings
    .flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn])
    .sort()[0]!
  const previous = rest.slots(first, plusDays(report.dueOn, -1)).at(-1)
  return previous === undefined || arrival > previous.due.dueOn
}

/** Q2 a : les reports seuls qui tenaient avant le geste et ne tiennent plus après lui. */
export function brokenReports(
  before: TreatmentViewInput,
  after: TreatmentViewInput,
  from: Day,
): Line[] {
  const afterView = buildView(after)
  const moving = new Set(
    afterView.history.flatMap(({ line, effect }) => (effect.kind === 'moves' ? [line.id] : [])),
  )
  return loneReports(buildView(before), from).filter((report) => {
    const now = after.lines.find(({ id }) => id === report.id)
    if (now === undefined || !reportHolds(before, report)) return false
    return !moving.has(now.id) || !reportHolds(after, now)
  })
}

/**
 * G19 : le report seul vise l'échéance du nouveau calendrier la plus proche de son ancienne arrivée et
 * garde cette date dans les bornes de Q2 a, sinon s'en approche, jamais avant aujourd'hui ; `null` :
 * aucune date ne convient. Ramené sur sa journée, il n'a plus de raison d'être (R7).
 */
export function followed(
  input: TreatmentViewInput,
  report: Line,
  from: Day,
): { change: LineChange; to: Day } | null {
  const rest = buildView(without(input, [report.id]))
  const was = report.targetOn!
  const frequency = (
    rest.settingAt(was) ?? input.settings.find(({ id }) => id === report.settingId)!
  ).frequency
  const pending = rest
    .slots(plusDays(from, 1), stepped(was, frequency, 2))
    .filter(({ state }) => state === 'pending')
  const days = [...new Set(pending.map(({ due }) => due.dueOn))]
  const distance = (day: Day) => Math.abs(Date.parse(day) - Date.parse(was))
  const target = days.reduce<Day | undefined>(
    (best, day) => (best === undefined || distance(day) < distance(best) ? day : best),
    undefined,
  )
  if (target === undefined) return null
  const index = days.indexOf(target)
  const earliest = later(input.today, plusDays(days[index - 1] ?? from, 1))
  const nextOn = days[index + 1]
  const latest = nextOn === undefined ? null : plusDays(nextOn, -1)
  if (latest !== null && earliest > latest) return null
  const arrival = was < earliest ? earliest : latest !== null && was > latest ? latest : was
  if (arrival === target) return { change: { action: 'delete', id: report.id }, to: arrival }
  const first = pending.find(({ due }) => due.dueOn === target)!.due
  const line = {
    settingId: report.settingId,
    dueOn: target,
    dueTime: first.dueTime,
    status: report.status,
    givenOn: null,
    targetOn: arrival,
  }
  return { change: { action: 'rewrite', id: report.id, line }, to: arrival }
}

/** R7, G9 : un report écrit par le geste n'arrive ni sur la journée d'origine d'un autre report, ni sur la sienne. */
export function arrivesOnOrigin(
  after: TreatmentView,
  settings: readonly Setting[],
  written: readonly LineChange[],
): boolean {
  const reports = after.history
    .filter(({ line, effect }) => line.status === 'postponed' && effect.kind === 'moves')
    .map(({ line }) => line)
  return written.some((change) => {
    if (change.action === 'delete' || change.line.status !== 'postponed') return false
    const { dueOn, targetOn } = change.line
    const id = change.action === 'rewrite' ? change.id : null
    const episode = episodeIdsOf(settings, change.line.settingId)
    return reports.some(
      (other) =>
        other.id !== id &&
        episode.has(other.settingId) &&
        other.dueOn === targetOn &&
        dueOn !== other.dueOn,
    )
  })
}

/**
 * R6 : une prise qui couvrait sa propre échéance au calendrier la couvre encore après le geste, ou une
 * prise plus récente de la même dose la couvre (TR-25) ; une prise qui garde sa journée hors du
 * calendrier (R4) n'en a pas à perdre.
 */
export function strandsNote(before: TreatmentView, after: TreatmentView): boolean {
  const effects = new Map(after.history.map(({ line, effect }) => [line.id, { line, effect }]))
  const covered = new Set(
    after.history.flatMap(({ effect }) => (effect.kind === 'covers' ? [effect.key] : [])),
  )
  const replaced = ({ effect }: { effect: LineEffect }, key: string) =>
    effect.kind === 'idle' && effect.reason === 'superseded' && covered.has(key)
  const onCalendar = (view: TreatmentView, { dueOn, dueTime }: Line) =>
    view.slots(dueOn, dueOn).some(({ due }) => due.dueTime === dueTime)
  return before.history.some(({ line, effect }) => {
    if (effect.kind !== 'covers' || effect.key !== keyOf(line.dueOn, line.dueTime)) return false
    const now = effects.get(line.id)
    if (now === undefined || now.line.dueOn !== line.dueOn || now.line.dueTime !== line.dueTime) {
      return false
    }
    if (!onCalendar(before, line) || replaced(now, effect.key)) return false
    return now.effect.kind !== 'covers' || now.effect.key !== effect.key || !onCalendar(after, line)
  })
}
