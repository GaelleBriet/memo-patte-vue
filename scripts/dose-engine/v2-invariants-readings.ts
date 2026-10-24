import {
  applied,
  newSettings,
  play,
  preview,
  settingsApplied,
  treatmentView,
  type Day,
  type Due,
  type Line,
  type TreatmentView,
  type TreatmentViewInput,
} from '@/shared/domain/dose-calendar'
import { shiftDayOf } from '@/shared/domain/dose-calendar/gestures/outcome'
import { referenceReading } from '@/shared/domain/dose-calendar/reference-model'

import { int, plusDays, type Random } from './carnet'
import { dueKey, gapsBetween } from './display'
import { calendarOf, compare, displayOf, firstDayOf, horizonOf, type Broken } from './v2-reading'
import type { V2Step } from './v2-walk'

/** 3. R3, Q-retard : « Modifier » à fréquence et heures égales ne change ni le calendrier ni les états, sans exemption. */
export function posology(input: TreatmentViewInput): Broken | null {
  const view = treatmentView(input)
  const current = view.currentSetting
  if (current === null || view.phase === 'stopped' || view.phase === 'ended') return null
  const { frequency, times, endsOn } = current
  const result = newSettings(input, { frequency, times, endsOn })
  if (!('plan' in result)) {
    return { invariant: 'posologie sans effet', detail: `pas de plan : ${JSON.stringify(result)}` }
  }
  const until = horizonOf(input)
  const read = (carnet: TreatmentViewInput) => {
    const after = treatmentView(carnet)
    const within = (dues: Due[]) => dues.map(dueKey).filter((key) => key.slice(0, 10) <= until)
    const effects = after.history.map(({ line, effect }) => `${line.id} ${JSON.stringify(effect)}`)
    return [
      after.phase,
      within(after.unloggedDoses),
      within(after.currentDoses),
      within(after.upcoming({ to: until })),
      effects,
    ]
  }
  return compare('posologie sans effet', read(input), read(settingsApplied(input, result.plan)))
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

/** 5. R6 : « Fait à une autre date J » = « C'est fait » puis « Changer la date » vers J, pour la dose du moment déjà tombée. */
export function symmetry(input: TreatmentViewInput, random: Random): Broken | null {
  const due = treatmentView(input).currentDoses.find(({ dueOn }) => dueOn <= input.today)
  return due === undefined ? null : symmetryOf(input, due, random)
}

/** 5 bis. La même symétrie pour la première dose à venir, dose du moment ou non (#1242). */
export function symmetryAhead(input: TreatmentViewInput, random: Random): Broken | null {
  const [due] = treatmentView(input).upcoming({ from: plusDays(input.today, 1), limit: 1 })
  return due === undefined ? null : symmetryOf(input, due, random)
}

type Played = {
  direct: ReturnType<typeof play>
  afterTap: TreatmentViewInput
  redated: ReturnType<typeof play>
}

function bothWays(
  input: TreatmentViewInput,
  due: Due,
  givenOn: Day,
  checked: boolean,
): Played | null {
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
  return { direct, afterTap, redated }
}

/**
 * Résidus connus de la case, jugés case décochée : #1242, « Changer la date » la propose pour une dose
 * qui n'est pas la dose du moment, « Fait à une autre date » non ; #1255, l'inverse quand la journée de
 * la dose porte déjà un décalage.
 */
function isKnownResidual(
  input: TreatmentViewInput,
  view: TreatmentView,
  due: Due,
  shiftDay: Day,
  { direct, redated }: Played,
): boolean {
  if ('refusal' in direct || 'refusal' in redated) return false
  const current = view.currentDoses.some((other) => dueKey(other) === dueKey(due))
  if (!current && redated.offersShift && !direct.offersShift) return true
  const shifted = input.lines.some(({ status, dueOn }) => status === 'shift' && dueOn === shiftDay)
  return shifted && direct.offersShift && !redated.offersShift
}

function symmetryOf(input: TreatmentViewInput, due: Due, random: Random): Broken | null {
  const view = treatmentView(input)
  // Exemption (ecarts-acceptes.md) : un décalage ancré au jour du tap part avec la prise corrigée.
  const shiftDay = shiftDayOf(view, due)
  const anchoredToday = ({ status, dueOn, targetOn }: Line) =>
    status === 'shift' && dueOn === shiftDay && targetOn === input.today
  if (input.lines.some(anchoredToday)) return null
  const givenOn = plusDays(input.today, -int(random, 0, 6))
  const boundary = view.earliestGivenOn(due)
  if (boundary !== null && givenOn < boundary) return null
  let checked = random() < 0.65
  let played = bothWays(input, due, givenOn, checked)
  if (played !== null && checked && isKnownResidual(input, view, due, shiftDay, played)) {
    checked = false
    played = bothWays(input, due, givenOn, checked)
  }
  if (played === null) return null
  const { direct, afterTap, redated } = played
  const label = `symétrie (${dueKey(due)} le ${givenOn}, case ${checked ? 'cochée' : 'décochée'})`
  if ('refusal' in direct || 'refusal' in redated) {
    const reasons = [
      'refusal' in direct ? direct.refusal.reason : 'accepté',
      'refusal' in redated ? redated.refusal.reason : 'accepté',
    ]
    return reasons[0] === reasons[1] ? null : { invariant: label, detail: reasons.join(' ≠ ') }
  }
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

/** 7. R12 : la préversion du geste ou du réglage est la lecture du carnet une fois écrit. */
export function previewIsResult(step: V2Step): Broken | null {
  const shown =
    step.plan !== null
      ? preview(step.before, step.plan)
      : step.gesture === null
        ? null
        : preview(step.before, step.gesture)
  if (shown === null) return null
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
