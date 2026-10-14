import {
  dueForDate,
  moveBounds,
  moveDose,
  newSettings,
  noteDose,
  redateDose,
  removeLine,
  treatmentView,
  type Frequency,
  type GestureResult,
  type LegacyDose,
  type LegacyPeriod,
  type LineChange as V2Change,
  type SettingsPlan,
  type TreatmentView,
} from '../domain/dose-calendar'
import { viewInputOf } from './dose-calendar.legacy-input.aides'

/**
 * Gestes et lectures du jeu de recette : lectures, gestes et réglages par le moteur v2 (épic #758).
 * Les écritures suivent le repository de l'app, sans purge (R11).
 */
export type Carnet = {
  periods: LegacyPeriod[]
  doses: (LegacyDose & { createdAt: string })[]
}

export type Due = { periodId: string; dueOn: string; dueTime: string | null }

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

export function vue(c: Carnet, today: string): TreatmentView {
  return treatmentView(viewInputOf({ periods: c.periods, doses: c.doses, today }))
}

/** L'échéance que vise « Fait à une autre date » pour une prise donnée ce jour-là. */
export function dateDonnee(c: Carnet, today: string, givenOn: string): Due {
  const due = dueForDate(entree(c, today), givenOn, null)
  if (due === null) throw new Error(`aucune échéance pour une prise du ${givenOn}`)
  return { periodId: due.settingId, dueOn: due.dueOn, dueTime: due.dueTime }
}

/** L'échéance d'un jour, et de son heure, dans le réglage en cours. */
export function echeance(c: Carnet, dueOn: string, dueTime: string | null = null): Due {
  return { periodId: c.periods.at(-1)!.id, dueOn, dueTime }
}

export function cle({ dueOn, dueTime }: Pick<Due, 'dueOn' | 'dueTime'>): string {
  return dueTime === null ? dueOn : `${dueOn} ${dueTime}`
}

function entree(c: Carnet, today: string) {
  return viewInputOf({ periods: c.periods, doses: c.doses, today })
}

function ecrit(c: Carnet, change: V2Change): Carnet {
  if (change.action === 'delete') return supprime(c, change.id)
  const at = now()
  const { settingId, targetOn, ...fields } = change.line
  const dose = {
    ...fields,
    periodId: settingId,
    nextDueDate: targetOn ?? fields.dueOn,
    updatedAt: at,
  }
  if (change.action === 'rewrite') {
    return {
      ...c,
      doses: c.doses.map((line) => (line.id === change.id ? { ...line, ...dose } : line)),
    }
  }
  return { ...c, doses: [...c.doses, { id: `d${stamp}`, ...dose, createdAt: at }] }
}

function joue(c: Carnet, result: GestureResult): Carnet {
  if ('refusal' in result) throw new Error(`geste refusé : ${JSON.stringify(result.refusal)}`)
  return result.changes.reduce(ecrit, c)
}

const v2 = ({ periodId, dueOn, dueTime }: Due) => ({ settingId: periodId, dueOn, dueTime })

/** « C'est fait » ou « Fait à une autre date » ; `decale` : la case, cochée par défaut (G20). */
export function donne(c: Carnet, today: string, due: Due, givenOn = today, decale = true) {
  const gesture = { due: v2(due), status: 'given' as const, givenOn, shiftsFollowing: decale }
  return joue(c, noteDose(entree(c, today), gesture))
}

/** Une prise reçue d'un autre appareil : écrite telle quelle, sans geste ni garde de l'app. */
export function recoit(c: Carnet, due: Due, givenOn = due.dueOn): Carnet {
  const line = { ...v2(due), status: 'given' as const, givenOn, targetOn: null }
  return ecrit(c, { action: 'create', line })
}

export function oublie(c: Carnet, today: string, due: Due): Carnet {
  const gesture = {
    due: v2(due),
    status: 'missed' as const,
    givenOn: due.dueOn,
    shiftsFollowing: false,
  }
  return joue(c, noteDose(entree(c, today), gesture))
}

/** « Prochaine dose » : la dose déplacée, avec ou sans la case « Décaler aussi les doses suivantes ». */
export function deplace(c: Carnet, today: string, due: Due, to: string, decale = true): Carnet {
  return joue(c, moveDose(entree(c, today), { due: v2(due), to, shiftsFollowing: decale }))
}

/** Les bornes de « Prochaine dose », ou son refus. */
export function bornes(c: Carnet, today: string, due: Due, decale = true) {
  return moveBounds(entree(c, today), v2(due), decale)
}

/** La case « Décaler aussi les doses suivantes » est-elle proposée pour une prise notée ce jour-là ? */
export function caseProposee(c: Carnet, today: string, due: Due, givenOn = today): boolean {
  const gesture = { due: v2(due), status: 'given' as const, givenOn, shiftsFollowing: false }
  const result = noteDose(entree(c, today), gesture)
  if ('refusal' in result) throw new Error(`geste refusé : ${JSON.stringify(result.refusal)}`)
  return result.offersShift
}

/** « Changer la date » d'une prise donnée. */
export function corrige(c: Carnet, today: string, doseId: string, givenOn: string, decale = true) {
  return joue(c, redateDose(entree(c, today), { lineId: doseId, givenOn, shiftsFollowing: decale }))
}

export function supprime(c: Carnet, doseId: string): Carnet {
  return { ...c, doses: c.doses.filter(({ id }) => id !== doseId) }
}

export function supprimeReport(c: Carnet, today: string, doseId: string): Carnet {
  return joue(c, removeLine(entree(c, today), doseId))
}

export function supprimeDecalage(c: Carnet, today: string, doseId: string): Carnet {
  return joue(c, removeLine(entree(c, today), doseId))
}

function plan(c: Carnet, today: string, frequency: Frequency, times: string[], premiere?: string) {
  const asked = {
    frequency,
    times,
    endsOn: null,
    ...(premiere === undefined ? {} : { firstDueOn: premiere }),
  }
  const result = newSettings(entree(c, today), asked)
  if (!('plan' in result)) throw new Error(`« Modifier » sans plan : ${JSON.stringify(result)}`)
  return result.plan
}

/** La première échéance que « Modifier » propose pour ces réglages. */
export function proposition(c: Carnet, today: string, frequency: Frequency, times: string[]) {
  return plan(c, today, frequency, times).setting.firstDueOn
}

// Une grille héritée (R3) s'écrit au schéma v11 en reprenant la référence du réglage précédent.
function periodOf(
  { gridOriginOn, ...setting }: SettingsPlan['setting'],
  previous: Carnet['periods'][number] | undefined,
) {
  const referenceOn = gridOriginOn ?? previous?.referenceOn ?? setting.firstDueOn
  return { ...setting, referenceOn, times: [...setting.times] }
}

/** « Modifier » : le réglage que le moteur v2 écrit, à la date proposée ou à la « Prochaine dose » choisie. */
export function modifie(
  c: Carnet,
  today: string,
  frequency: Frequency,
  times: string[],
  premiere?: string,
): Carnet {
  const written = plan(c, today, frequency, times, premiere)
  if (written.action === 'rewrite') {
    const periods = c.periods.map((period, index) =>
      period.id === written.id
        ? { ...period, ...periodOf(written.setting, c.periods[index - 1]) }
        : period,
    )
    return { ...c, periods }
  }
  const period = {
    id: `p${c.periods.length + 1}`,
    ...periodOf(written.setting, c.periods.at(-1)),
    stoppedOn: null,
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
