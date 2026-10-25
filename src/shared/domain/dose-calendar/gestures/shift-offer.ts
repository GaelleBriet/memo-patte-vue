import { keyOf } from '../grid'
import { episodeIdsOf } from '../settings'
import type { Day, Due, Line, TreatmentViewInput } from '../types'
import { buildView } from '../view'
import { ownsDayShift, shiftOfDay } from './changes'
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
  const own = shiftOfDay(carnet.lines, shiftDay)
  if (own !== undefined && writtenByAnotherHour(carnet, due, own)) return false
  const later = linesAfter(carnet, due, new Set(own === undefined ? [] : [own.id]))
  if (later.notes.length > 0 || later.others.some(({ status }) => status === 'shift')) return false
  const onThatDay = buildView({ ...carnet, today: givenOn })
  return (
    onThatDay.currentDoses.some(sameKey) ||
    onThatDay.upcoming({ from: givenOn, to: due.dueOn }).some(sameKey)
  )
}

// Q48 : un geste sur une heure ne réécrit jamais le décalage d'une autre heure.
function writtenByAnotherHour(carnet: TreatmentViewInput, due: Due, shift: Line): boolean {
  return carnet.lines.some(
    (prise) =>
      prise.status === 'given' &&
      prise.settingId === due.settingId &&
      prise.dueOn === due.dueOn &&
      prise.dueTime !== due.dueTime &&
      ownsDayShift(carnet, prise, shift),
  )
}
