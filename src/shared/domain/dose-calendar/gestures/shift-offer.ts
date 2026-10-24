import { keyOf } from '../grid'
import { episodeIdsOf } from '../settings'
import type { Day, Due, TreatmentViewInput } from '../types'
import { buildView } from '../view'
import { shiftOfDay } from './changes'
import { linesAfter, movedAlone, shiftDayOf } from './outcome'

/**
 * R6, TR-24 bis, Q38 : la case « Décaler aussi les doses suivantes » est proposée pour la prise qui
 * vise `due` à la date `givenOn`, quel que soit le geste (« Fait à une autre date », « Changer la
 * date »). `carnet` est le carnet sans cette prise, décalages et reports de la journée gardés : la
 * dose est encore la dose du moment ou une dose à venir au jour `givenOn`, c'est la dernière heure
 * sans prise de sa journée, rien n'est noté ni décalé plus loin, et ce n'est pas une dose déplacée
 * seule (Q2 c).
 */
export function offersShiftFor(carnet: TreatmentViewInput, due: Due, givenOn: Day): boolean {
  if (givenOn === due.dueOn) return false
  const view = buildView(carnet)
  const inForce = episodeIdsOf(carnet.settings, due.settingId).has(view.currentSetting?.id ?? '')
  if (view.phase === 'stopped' || !inForce) return false
  if (movedAlone(view, carnet.lines, due.dueOn)) return false
  const key = keyOf(due.dueOn, due.dueTime)
  const sameKey = (other: Due) => keyOf(other.dueOn, other.dueTime) === key
  const sameDay = view.slots(due.dueOn, due.dueOn)
  if (sameDay.some(({ due: other, state }) => state === 'pending' && !sameKey(other))) return false
  const own = shiftOfDay(carnet.lines, shiftDayOf(view, due))
  const later = linesAfter(carnet, due, new Set(own === undefined ? [] : [own.id]))
  if (later.notes.length > 0 || later.others.some(({ status }) => status === 'shift')) return false
  const onThatDay = buildView({ ...carnet, today: givenOn })
  return (
    onThatDay.currentDoses.some(sameKey) ||
    onThatDay.upcoming({ from: givenOn, to: due.dueOn }).some(sameKey)
  )
}
