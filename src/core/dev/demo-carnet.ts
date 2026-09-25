import { addMonths, format, subDays, subMonths, subYears } from 'date-fns'
import type { AnimalInput } from '@/features/animals/schema/animal.schema'
import type { TreatmentInput } from '@/features/treatments/schema/treatment.schema'
import type { VaccinationInput } from '@/features/vaccinations/schema/vaccination.schema'
import type { WeightEntryInput } from '@/features/weight/schema/weight.schema'

/**
 * Jeu de démo des maquettes (`docs/design/carnet-v2/carnet.md`, « Contenu
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

export interface DemoTreatment extends Omit<TreatmentInput, 'animalId'> {
  /** Prises antérieures à la dernière, la plus récente d'abord. */
  history?: { givenOn: string; nextDueDate: string }[]
  stoppedOn?: string
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

/** Prises mensuelles antérieures à `last`, chacune fixant la suivante. */
function monthlyHistory(last: Date, count: number): NonNullable<DemoTreatment['history']> {
  return Array.from({ length: count }, (_, index) => ({
    givenOn: day(subMonths(last, index + 1)),
    nextDueDate: day(subMonths(last, index)),
  }))
}

export function buildDemoCarnet(today: Date): DemoAnimal[] {
  const chppiLast = subMonths(subDays(today, 45), 12)
  const drontalLast = subDays(today, 20)
  const advocateStop = subMonths(today, 4)
  const advocateLast = subDays(advocateStop, 5)

  return [
    {
      animal: {
        name: 'Milo',
        species: 'dog',
        breed: 'Golden retriever',
        birthDate: day(subYears(today, 4)),
        initialWeightKg: 8.5,
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
          frequency: { value: 3, unit: 'month' },
          lastDoseDate: day(subDays(subMonths(today, 2), 15)),
        },
        // Plus de 12 prises : l'historique se regroupe par année.
        {
          name: 'Drontal',
          type: 'deworming',
          frequency: { value: 1, unit: 'month' },
          lastDoseDate: day(drontalLast),
          history: monthlyHistory(drontalLast, 14),
        },
        // Arrêté : dans « Traitements terminés ».
        {
          name: 'Advocate',
          type: 'antiparasitic',
          frequency: { value: 15, unit: 'day' },
          lastDoseDate: day(advocateLast),
          history: [{ givenOn: day(subDays(advocateLast, 15)), nextDueDate: day(advocateLast) }],
          stoppedOn: day(advocateStop),
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
        initialWeightKg: 0.9,
      },
      vaccinations: [
        {
          name: 'Typhus',
          lastInjectionDate: day(subMonths(today, 3)),
          dueDate: day(addMonths(today, 9)),
        },
      ],
      treatments: [
        {
          name: 'Milbemax',
          type: 'deworming',
          frequency: { value: 3, unit: 'month' },
          lastDoseDate: day(subMonths(today, 1)),
        },
      ],
      weights: monthlyWeights(today, [3.8, 3.9, 4.1, 4.2]),
    },
  ]
}
