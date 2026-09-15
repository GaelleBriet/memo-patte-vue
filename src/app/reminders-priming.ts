import type { Router } from 'vue-router'

import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { shouldShowPriming } from '@/core/notifications'
import type { Animal } from '@/features/animals/animal.schema'
import { getAnimalsRepository, type AnimalsRepository } from '@/features/animals/animals.repository'
import type { Treatment } from '@/features/treatments/treatment.schema'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/treatments.repository'
import type { Vaccination } from '@/features/vaccinations/vaccination.schema'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/vaccinations.repository'
import { primingRouteFrom } from '@/shared/notification-priming'

type Provider<T> = () => T | Promise<T>

export type CarnetDueDates = {
  animals: Pick<Animal, 'id' | 'deletedAt'>[]
  vaccinations: Pick<Vaccination, 'animalId' | 'dueDate' | 'deletedAt'>[]
  treatments: Pick<Treatment, 'animalId' | 'deletedAt'>[]
}

/** Un traitement compte toujours : ses rappels suivent la fréquence, même quand sa dernière échéance est passée. */
export function hasUpcomingDueDates(
  { animals, vaccinations, treatments }: CarnetDueDates,
  today: string,
): boolean {
  const activeAnimals = new Set(
    animals.filter((animal) => animal.deletedAt === null).map((animal) => animal.id),
  )
  const isActive = (entry: { animalId: string; deletedAt: string | null }) =>
    entry.deletedAt === null && activeAnimals.has(entry.animalId)

  return (
    vaccinations.some(
      (vaccination) =>
        isActive(vaccination) && vaccination.dueDate !== null && vaccination.dueDate >= today,
    ) || treatments.some(isActive)
  )
}

export type RemindersPrimingDependencies = {
  shouldShowPriming: () => Promise<boolean>
  animals: Provider<Pick<AnimalsRepository, 'list'>>
  vaccinations: Provider<Pick<VaccinationsRepository, 'listAll'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listAll'>>
  today: () => string
}

export type PromptNotificationsIfReminders = (router: Router, from: string) => Promise<boolean>

export function createRemindersPriming({
  shouldShowPriming,
  animals,
  vaccinations,
  treatments,
  today,
}: RemindersPrimingDependencies): PromptNotificationsIfReminders {
  return async (router, from) => {
    try {
      if (!(await shouldShowPriming())) return false

      const [animalsRepository, vaccinationsRepository, treatmentsRepository] = await Promise.all([
        animals(),
        vaccinations(),
        treatments(),
      ])
      const [animalRows, vaccinationRows, treatmentRows] = await Promise.all([
        animalsRepository.list(),
        vaccinationsRepository.listAll(),
        treatmentsRepository.listAll(),
      ])
      const carnet = {
        animals: animalRows,
        vaccinations: vaccinationRows,
        treatments: treatmentRows,
      }
      if (!hasUpcomingDueDates(carnet, today())) return false

      if (router.currentRoute.value.name !== from) return false
      await router.replace(primingRouteFrom(from))
      return true
    } catch (cause) {
      console.warn('Écran d’explication des rappels non proposé :', cause)
      return false
    }
  }
}

/**
 * Remplace l'écran `from` par l'écran d'explication quand la permission n'a jamais été demandée et
 * que le carnet a une échéance à venir. Sans effet si l'on a quitté `from` entre-temps ; ne lève jamais.
 */
export const promptNotificationsIfReminders = createRemindersPriming({
  shouldShowPriming,
  animals: getAnimalsRepository,
  vaccinations: getVaccinationsRepository,
  treatments: getTreatmentsRepository,
  today: todayIsoDate,
})

export function installLaunchPriming(
  router: Router,
  prompt: PromptNotificationsIfReminders = promptNotificationsIfReminders,
): void {
  void router.isReady().then(
    () => prompt(router, 'home'),
    () => false,
  )
}
