import { keyOf } from '../grid'
import { episodeIdsOf } from '../settings'
import type { Day, Due, Line, LineChange, TreatmentViewInput } from '../types'
import { buildView, type TreatmentView } from '../view'
import { applied, ownsDayShift, rhythmOf, shiftOfDay, shiftWritten, written } from './changes'
import { linesAfter, movedAlone, shiftDayOf } from './outcome'

/**
 * R6, TR-24 bis, Q38, Q46 : la case « Décaler aussi les doses suivantes » est proposée pour la prise
 * qui vise `due` à la date `givenOn`, quel que soit le geste (« Fait à une autre date », « Changer la
 * date »). `carnet` est le carnet sans cette prise ni son propre décalage, reports et décalages de la
 * journée gardés. Jamais pour une dose déjà non renseignée aujourd'hui (N1), sauf quand la prise
 * corrigée porte son propre décalage (`ownsShift`) : la case le déplace avec elle. Sinon : la dose du
 * moment ou une dose à venir au jour `givenOn`, la dernière heure sans prise de sa journée, rien de
 * noté ni de décalé plus loin, pas une dose déplacée seule (Q2 c), pas une journée qui porte le
 * décalage de la prise d'une autre heure (Q48).
 */
export function offersShiftFor(
  carnet: TreatmentViewInput,
  due: Due,
  givenOn: Day,
  ownsShift = false,
): boolean {
  if (givenOn === due.dueOn) return false
  const view = buildView(carnet)
  const inForce = episodeIdsOf(carnet.settings, due.settingId).has(view.currentSetting?.id ?? '')
  if (view.phase === 'stopped' || !inForce) return false
  if (movedAlone(view, carnet.lines, due.dueOn)) return false
  const key = keyOf(due.dueOn, due.dueTime)
  const sameKey = (other: Due) => keyOf(other.dueOn, other.dueTime) === key
  if (!ownsShift && view.unloggedDoses.some(sameKey)) return false
  const sameDay = view.slots(due.dueOn, due.dueOn)
  if (sameDay.some(({ due: other, state }) => state === 'pending' && !sameKey(other))) return false
  const shiftDay = shiftDayOf(view, due)
  const own = shiftOfDay(carnet.lines.filter(rhythmOf(carnet, due)), shiftDay)
  if (own !== undefined && writtenByAnotherHour(carnet, due, own)) return false
  const later = linesAfter(carnet, due, new Set(own === undefined ? [] : [own.id]))
  if (later.notes.length > 0 || later.others.some(({ status }) => status === 'shift')) return false
  const onThatDay = buildView({ ...carnet, today: givenOn })
  const ahead =
    onThatDay.currentDoses.some(sameKey) ||
    onThatDay.upcoming({ from: givenOn, to: due.dueOn }).some(sameKey)
  return ahead && !changesNothing(carnet, view, due, givenOn)
}

// Q84 (#1373) : avant la première échéance d'une date choisie, la case n'est proposée que si elle
// change la suite.
function changesNothing(
  carnet: TreatmentViewInput,
  view: TreatmentView,
  due: Due,
  givenOn: Day,
): boolean {
  const inForce = view.settingAt(due.dueOn)
  if (inForce?.firstDueChosen !== true || due.dueOn >= inForce.firstDueOn) return false
  const note = written(carnet.lines, { ...due, status: 'given', givenOn, targetOn: null })
  const at = { ...due, dueOn: shiftDayOf(view, due) }
  const shift = shiftWritten(carnet.lines.filter(rhythmOf(carnet, due)), at, givenOn)
  const next = (changes: LineChange[]) => {
    const after = buildView(applied(carnet, changes))
    return JSON.stringify([after.currentDoses, after.upcoming({ from: givenOn, limit: 12 })])
  }
  return next([note]) === next([note, shift])
}

// Q48 ; une prise donnée le jour de son échéance n'a jamais eu la case, elle n'a donc rien écrit.
function writtenByAnotherHour(carnet: TreatmentViewInput, due: Due, shift: Line): boolean {
  return carnet.lines.some(
    (prise) =>
      prise.status === 'given' &&
      prise.settingId === due.settingId &&
      prise.dueOn === due.dueOn &&
      prise.dueTime !== due.dueTime &&
      prise.givenOn !== prise.dueOn &&
      ownsDayShift(carnet, prise, shift),
  )
}
