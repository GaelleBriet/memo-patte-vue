import { addDays, addMonths, format, subDays, subMonths, subYears } from 'date-fns'
import type { AnimalInput } from '@/features/animals/schema/animal.schema'
import type { NewTreatmentDose } from '@/features/treatments/schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '@/features/treatments/schema/treatment-period.schema'
import type { TreatmentType } from '@/features/treatments/schema/treatment.schema'
import type { VaccinationInput } from '@/features/vaccinations/schema/vaccination.schema'
import type { WeightEntryInput } from '@/features/weight/schema/weight.schema'

/**
 * Jeu de démo des maquettes (`docs/design/archives/avant-v1/carnet-v2/carnet.md`, « Contenu
 * d'exemple des maquettes ») : Milo et Luna.
 *
 * Outil de développement, jamais livré (voir `fixtures.ts`) : les libellés
 * restent en dur, exception assumée à la règle i18n.
 *
 * Toutes les dates sont relatives à `today`, jamais absolues : ce sont les
 * statuts (en retard, à jour, dose bientôt) qui doivent rester ceux de la
 * maquette, quelle que soit la date à laquelle on lance l'app.
 */
export interface DemoVaccination extends Omit<VaccinationInput, 'animalId'> {
  /** Injections antérieures à la dernière, la plus récente d'abord. */
  history?: { injectedOn: string; nextDueDate: string | null }[]
}

export type DemoDose = Pick<
  NewTreatmentDose,
  'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'nextDueDate'
>

/** Une échéance sans ligne dans `doses` est une dose non renseignée. */
export type DemoPeriod = Pick<TreatmentPeriodRecord, 'startsOn' | 'frequency'> &
  Partial<
    Pick<
      TreatmentPeriodRecord,
      | 'firstDueOn'
      | 'endsOn'
      | 'stoppedOn'
      | 'times'
      | 'doseQuantity'
      | 'doseUnit'
      | 'reminderOffsetMinutes'
      | 'reminderTime'
    >
  > & { doses: DemoDose[] }

export interface DemoTreatment {
  name: string
  type: TreatmentType
  /** De la première à la dernière : une reprise ouvre une nouvelle période. */
  periods: DemoPeriod[]
}

export interface DemoAnimal {
  animal: AnimalInput
  vaccinations: DemoVaccination[]
  treatments: DemoTreatment[]
  weights: Omit<WeightEntryInput, 'animalId'>[]
}

/**
 * Marqueur propre au carnet de démo, introuvable ailleurs dans l'app : `pnpm test:build`
 * le cherche dans `dist/` plutôt que des noms (Milo, Bravecto…) qu'un placeholder
 * légitime peut reprendre. Il doit rester lu à l'exécution pour ne pas être éliminé
 * du bundle si le module fuyait en production.
 */
export const DEMO_CARNET_MARKER = 'memo-patte:demo-carnet'

const DATE_FORMAT = 'yyyy-MM-dd'
const MORNING = '08:00'
const EVENING = '20:00'

function day(date: Date): string {
  return format(date, DATE_FORMAT)
}

/** Une pesée par mois, de la plus ancienne à celle de ce mois-ci. */
function monthlyWeights(today: Date, weightsKg: number[]): DemoAnimal['weights'] {
  return weightsKg.map((weightKg, index) => ({
    weightKg,
    measuredOn: day(subMonths(today, weightsKg.length - 1 - index)),
  }))
}

function given(on: Date, next: Date, dueTime: string | null = null): DemoDose {
  return { dueOn: day(on), dueTime, givenOn: day(on), status: 'given', nextDueDate: day(next) }
}

function missed(on: Date, next: Date, dueTime: string | null = null): DemoDose {
  return { dueOn: day(on), dueTime, givenOn: null, status: 'missed', nextDueDate: day(next) }
}

function postponed(from: Date, to: Date): DemoDose {
  return {
    dueOn: day(from),
    dueTime: null,
    givenOn: null,
    status: 'postponed',
    nextDueDate: day(to),
  }
}

/** Le décalage qui accompagne un report : les doses suivantes repartent de sa nouvelle date. */
function shifted(from: Date, to: Date): DemoDose {
  return { dueOn: day(from), dueTime: null, givenOn: null, status: 'shift', nextDueDate: day(to) }
}

/** `count` prises mensuelles jusqu'à `last`, chacune fixant la suivante. */
function monthlyDoses(last: Date, count: number): DemoDose[] {
  return Array.from({ length: count }, (_, index) =>
    given(subMonths(last, count - 1 - index), subMonths(last, count - 2 - index)),
  )
}

export function buildDemoCarnet(today: Date): DemoAnimal[] {
  const chppiLast = subMonths(subDays(today, 45), 12)
  const bravectoLast = subDays(subMonths(today, 2), 15)
  const drontalLast = subDays(today, 20)
  const advocateStop = subMonths(today, 4)
  const advocateLast = subDays(advocateStop, 5)
  const panacurStart = subDays(today, 5)
  const milbemaxFirst = subMonths(today, 13)
  const milbemaxResume = subMonths(today, 1)
  const frontlineStart = subMonths(today, 2)
  const frontlineDue = subMonths(today, 1)
  const frontlineGiven = addDays(frontlineDue, 3)

  return [
    {
      animal: {
        name: 'Milo',
        species: 'dog',
        breed: 'Golden retriever',
        birthDate: day(subYears(today, 4)),
      },
      vaccinations: [
        // En retard : rappel annuel, échéance dépassée de 45 jours, après une primo-vaccination.
        {
          name: 'CHPPi',
          lastInjectionDate: day(chppiLast),
          dueDate: day(subDays(today, 45)),
          history: [
            { injectedOn: day(subYears(chppiLast, 1)), nextDueDate: day(chppiLast) },
            {
              injectedOn: day(subMonths(chppiLast, 13)),
              nextDueDate: day(subYears(chppiLast, 1)),
            },
          ],
        },
        // À jour : encore dix mois de validité.
        {
          name: 'Rage',
          lastInjectionDate: day(subMonths(today, 2)),
          dueDate: day(addMonths(today, 10)),
        },
      ],
      treatments: [
        // Prise il y a deux mois et demi, tous les trois mois : prochaine dose bientôt.
        {
          name: 'Bravecto',
          type: 'antiparasitic',
          periods: [
            {
              startsOn: day(bravectoLast),
              frequency: { value: 3, unit: 'month' },
              doses: [given(bravectoLast, addMonths(bravectoLast, 3))],
            },
          ],
        },
        // Plus de 12 prises : l'historique se regroupe par année.
        {
          name: 'Drontal',
          type: 'deworming',
          periods: [
            {
              startsOn: day(subMonths(drontalLast, 14)),
              frequency: { value: 1, unit: 'month' },
              doses: monthlyDoses(drontalLast, 15),
            },
          ],
        },
        // Arrêté : dans « Traitements terminés ».
        {
          name: 'Advocate',
          type: 'antiparasitic',
          periods: [
            {
              startsOn: day(subDays(advocateLast, 15)),
              frequency: { value: 15, unit: 'day' },
              stoppedOn: day(advocateStop),
              doses: [
                given(subDays(advocateLast, 15), advocateLast),
                given(advocateLast, addDays(advocateLast, 15)),
              ],
            },
          ],
        },
        // Matin et soir pendant dix jours : une dose oubliée, des doses non renseignées depuis.
        {
          name: 'Panacur',
          type: 'deworming',
          periods: [
            {
              startsOn: day(panacurStart),
              endsOn: day(addDays(panacurStart, 9)),
              frequency: { value: 1, unit: 'day' },
              times: [MORNING, EVENING],
              doseQuantity: 1,
              doseUnit: 'sachet',
              reminderOffsetMinutes: 15,
              doses: [
                given(panacurStart, panacurStart, MORNING),
                given(panacurStart, addDays(panacurStart, 1), EVENING),
                given(addDays(panacurStart, 1), addDays(panacurStart, 1), MORNING),
                missed(addDays(panacurStart, 1), addDays(panacurStart, 2), EVENING),
                given(addDays(panacurStart, 3), addDays(panacurStart, 3), MORNING),
              ],
            },
          ],
        },
      ],
      weights: monthlyWeights(today, [23.6, 23.8, 24, 24.1, 24.3, 24.5]),
    },
    {
      animal: {
        name: 'Luna',
        species: 'cat',
        breed: 'Européen',
        birthDate: day(subYears(today, 3)),
      },
      vaccinations: [
        {
          name: 'Typhus',
          lastInjectionDate: day(subMonths(today, 3)),
          dueDate: day(addMonths(today, 9)),
        },
      ],
      treatments: [
        // Arrêté il y a huit mois, repris le mois dernier : deux périodes.
        {
          name: 'Milbemax',
          type: 'deworming',
          periods: [
            {
              startsOn: day(milbemaxFirst),
              frequency: { value: 3, unit: 'month' },
              stoppedOn: day(subMonths(today, 8)),
              doses: [
                given(milbemaxFirst, addMonths(milbemaxFirst, 3)),
                given(addMonths(milbemaxFirst, 3), addMonths(milbemaxFirst, 6)),
              ],
            },
            {
              startsOn: day(milbemaxResume),
              frequency: { value: 3, unit: 'month' },
              doses: [given(milbemaxResume, addMonths(milbemaxResume, 3))],
            },
          ],
        },
        // Jusqu'à la fin de la saison : la dose du mois dernier reportée de trois jours, puis donnée.
        {
          name: 'Frontline',
          type: 'antiparasitic',
          periods: [
            {
              startsOn: day(frontlineStart),
              endsOn: day(addMonths(frontlineStart, 6)),
              frequency: { value: 1, unit: 'month' },
              doseQuantity: 1,
              doseUnit: 'pipette',
              reminderTime: '18:00',
              doses: [
                given(frontlineStart, frontlineDue),
                postponed(frontlineDue, frontlineGiven),
                shifted(frontlineDue, frontlineGiven),
                given(frontlineGiven, addMonths(frontlineGiven, 1)),
              ],
            },
          ],
        },
      ],
      weights: monthlyWeights(today, [3.8, 3.9, 4.1, 4.2]),
    },
  ]
}
