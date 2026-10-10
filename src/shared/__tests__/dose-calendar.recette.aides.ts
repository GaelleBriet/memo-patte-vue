import { treatmentView, viewInputOf, type TreatmentView } from '../domain/dose-calendar'
import {
  treatmentSchedule,
  type DoseFields,
  type Due,
  type Frequency,
  type LineChange,
  type TreatmentDoseInput,
  type TreatmentPeriodInput,
  type TreatmentSchedule,
} from '../domain/treatment-schedule'

/**
 * Gestes et lectures du jeu de recette : les lectures par le moteur v2 depuis le pas 2 de l'épic
 * #758, les gestes par le moteur actuel jusqu'aux pas 3 et 4. Les écritures suivent le repository de
 * l'app, sans purge (R11).
 */
export type Carnet = { periods: TreatmentPeriodInput[]; doses: TreatmentDoseInput[] }

export const H = ['08:00', '20:00']
export const jours = (value: number): Frequency => ({ value, unit: 'day' })
export const semaines = (value: number): Frequency => ({ value, unit: 'week' })
export const mois = (value: number): Frequency => ({ value, unit: 'month' })

let stamp = 0

// Après les horodatages des carnets extraits de la campagne, tous du 1er janvier.
function now(): string {
  stamp += 1
  return new Date(Date.UTC(2026, 1, 1, 0, 0, 0, stamp)).toISOString()
}

export function carnet(
  firstDueOn: string,
  frequency: Frequency,
  times: string[] = [],
  endsOn: string | null = null,
): Carnet {
  const period = {
    id: 'p1',
    startsOn: firstDueOn,
    firstDueOn,
    referenceOn: firstDueOn,
    endsOn,
    stoppedOn: null,
    frequency,
    times,
    createdAt: now(),
  }
  return { periods: [period], doses: [] }
}

export function lecture(c: Carnet, today: string): TreatmentSchedule {
  return treatmentSchedule({ periods: c.periods, doses: c.doses, today })
}

export function vue(c: Carnet, today: string): TreatmentView {
  return treatmentView(viewInputOf({ periods: c.periods, doses: c.doses, today }))
}

/** L'échéance d'un jour, et de son heure, dans le réglage en cours. */
export function echeance(c: Carnet, dueOn: string, dueTime: string | null = null): Due {
  return { periodId: c.periods.at(-1)!.id, dueOn, dueTime }
}

export function cle({ dueOn, dueTime }: Pick<Due, 'dueOn' | 'dueTime'>): string {
  return dueTime === null ? dueOn : `${dueOn} ${dueTime}`
}

const familyOf = ({ status }: Pick<TreatmentDoseInput, 'status'>) =>
  status === 'given' || status === 'missed' ? 'note' : status

function ecrit(c: Carnet, fields: DoseFields): Carnet {
  const at = now()
  const existing = c.doses.find(
    (dose) =>
      dose.periodId === fields.periodId &&
      cle(dose) === cle(fields) &&
      familyOf(dose) === familyOf(fields),
  )
  if (existing !== undefined) {
    const doses = c.doses.map((dose) =>
      dose === existing ? { ...dose, ...fields, updatedAt: at } : dose,
    )
    return { ...c, doses }
  }
  return { ...c, doses: [...c.doses, { id: `d${stamp}`, ...fields, createdAt: at, updatedAt: at }] }
}

function applique(c: Carnet, change: LineChange): Carnet {
  switch (change.action) {
    case 'none':
      return c
    case 'create':
      return ecrit(c, change.dose)
    case 'delete':
      return supprime(c, change.doseId)
    case 'rewrite': {
      const at = now()
      const doses = c.doses.map((dose) =>
        dose.id === change.doseId ? { ...dose, ...change.dose, updatedAt: at } : dose,
      )
      return { ...c, doses }
    }
  }
}

/** « C'est fait » ou « Fait à une autre date » ; `decale` : la case, absente pour un tap sans case. */
export function donne(c: Carnet, today: string, due: Due, givenOn = today, decale?: boolean) {
  const gesture = { kind: 'given' as const, due, givenOn, shiftsFollowing: decale }
  const noted = lecture(c, today).doseFor(gesture)
  const shifted = noted.shift === null ? c : ecrit(c, noted.shift)
  return ecrit(shifted, noted.dose)
}

export function oublie(c: Carnet, today: string, due: Due): Carnet {
  return ecrit(c, lecture(c, today).doseFor({ kind: 'missed', due }).dose)
}

/** « Prochaine dose » : la dose déplacée, avec ou sans la case « Décaler aussi les doses suivantes ». */
export function deplace(c: Carnet, today: string, due: Due, to: string, decale = true): Carnet {
  const { report, shift } = lecture(c, today).move(due, to, decale)
  return applique(applique(c, shift), report)
}

/** « Changer la date » d'une prise donnée. */
export function corrige(c: Carnet, today: string, doseId: string, givenOn: string, decale = true) {
  const { dose, shift, postponement } = lecture(c, today).redate(doseId, givenOn, decale)
  const at = now()
  const dropped = postponement?.kept === false ? postponement.doseIds : []
  const doses = c.doses
    .filter(({ id }) => !dropped.includes(id))
    .map((line) => {
      if (line.id === doseId) return { ...line, ...dose, updatedAt: at }
      if (postponement?.kept !== true) return line
      if (postponement.doseIds.includes(line.id)) {
        return { ...line, ...postponement.line, updatedAt: at }
      }
      return postponement.shiftIds.includes(line.id)
        ? { ...line, ...postponement.shiftLine, updatedAt: at }
        : line
    })
  return applique({ ...c, doses }, shift)
}

export function supprime(c: Carnet, doseId: string): Carnet {
  return { ...c, doses: c.doses.filter(({ id }) => id !== doseId) }
}

export function supprimeReport(c: Carnet, today: string, doseId: string): Carnet {
  const { report, shift } = lecture(c, today).removeMove(doseId)
  return applique(applique(c, report), shift)
}

export function supprimeDecalage(c: Carnet, today: string, doseId: string): Carnet {
  return applique(c, lecture(c, today).removeShift(doseId))
}

/** La première échéance que « Modifier » propose pour ces réglages. */
export function proposition(c: Carnet, today: string, frequency: Frequency, times: string[]) {
  return lecture(c, today).newPeriod(frequency, times).firstDueOn
}

/** « Modifier » : un nouveau réglage aux dates que le moteur actuel propose (pas 4 de l'épic). */
export function modifie(c: Carnet, today: string, frequency: Frequency, times: string[]): Carnet {
  const dates = lecture(c, today).newPeriod(frequency, times)
  const period = {
    id: `p${c.periods.length + 1}`,
    ...dates,
    endsOn: null,
    stoppedOn: null,
    frequency,
    times,
    createdAt: now(),
  }
  return { ...c, periods: [...c.periods, period] }
}

export function arrete(c: Carnet, today: string): Carnet {
  const last = c.periods.at(-1)!
  const periods = c.periods.map((period) =>
    period === last ? { ...period, stoppedOn: today } : period,
  )
  return { ...c, periods }
}

export function reprend(c: Carnet, today: string, firstDueOn: string, frequency: Frequency) {
  const period = {
    id: `p${c.periods.length + 1}`,
    startsOn: today,
    firstDueOn,
    referenceOn: firstDueOn,
    endsOn: null,
    stoppedOn: null,
    frequency,
    times: [],
    createdAt: now(),
  }
  return { ...c, periods: [...c.periods, period] }
}

/** Dose(s) du moment puis échéances à venir, sans doublon, en clés « jour heure ». */
export function affiche(c: Carnet, today: string, count = 6): string[] {
  const view = vue(c, today)
  const keys = [...view.currentDoses, ...view.upcoming({ limit: 60 })].map(cle)
  return [...new Set(keys)].slice(0, count)
}

/** Les journées de la dose du moment et des échéances à venir. */
export function journees(c: Carnet, today: string, count = 4): string[] {
  const view = vue(c, today)
  const days = [...view.currentDoses, ...view.upcoming({ limit: 80 })].map(({ dueOn }) => dueOn)
  return [...new Set(days)].slice(0, count)
}

export function aRenseigner(c: Carnet, today: string): string[] {
  return vue(c, today).unloggedDoses.map(cle)
}

/** Toutes les échéances sans prise, à renseigner, du moment ou à venir. */
export function sansPrise(c: Carnet, today: string): string[] {
  const view = vue(c, today)
  return [...view.unloggedDoses, ...view.currentDoses].map(cle)
}

export function ligne(c: Carnet, dueOn: string, dueTime: string | null, status: string) {
  const found = c.doses.find(
    (dose) => dose.dueOn === dueOn && dose.dueTime === dueTime && dose.status === status,
  )
  if (found === undefined) throw new Error(`aucune ligne ${status} le ${dueOn} ${dueTime ?? ''}`)
  return found
}
