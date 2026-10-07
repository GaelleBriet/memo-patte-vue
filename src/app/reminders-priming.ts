import { Capacitor } from '@capacitor/core'
import { format, parseISO, subDays } from 'date-fns'
import type { Router } from 'vue-router'

import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { shouldShowPriming } from '@/core/notifications'
import type { Animal } from '@/features/animals/schema/animal.schema'
import {
  getAnimalsRepository,
  type AnimalsRepository,
} from '@/features/animals/repository/animals.repository'
import { readableScheduleOf } from '@/features/treatments/logic/treatment-schedule'
import {
  getTreatmentsRepository,
  type TreatmentsRepository,
} from '@/features/treatments/repository/treatments.repository'
import type { TreatmentWithHistory } from '@/features/treatments/schema/treatment-with-history.schema'
import type { Vaccination } from '@/features/vaccinations/schema/vaccination.schema'
import {
  getVaccinationsRepository,
  type VaccinationsRepository,
} from '@/features/vaccinations/repository/vaccinations.repository'
import { DAYS_OVERDUE } from '@/shared/domain/due-reminders'
import { primingRouteFrom } from '@/shared/domain/notification-priming'

type Provider<T> = () => T | Promise<T>

export type CarnetDueDates = {
  animals: Pick<Animal, 'id' | 'deletedAt' | 'unfollowedOn'>[]
  vaccinations: Pick<Vaccination, 'animalId' | 'dueDate' | 'deletedAt'>[]
  treatments: Pick<TreatmentWithHistory, 'animalId' | 'periods' | 'doses'>[]
}

/** D'après le moteur : ni fini, ni arrêté, ni illisible, avec une dose du moment ou à venir. */
function hasUpcomingDose(treatment: CarnetDueDates['treatments'][number], today: string): boolean {
  const schedule = readableScheduleOf(treatment, today)
  if (schedule === null || schedule.phase === 'ended' || schedule.phase === 'stopped') return false
  return schedule.currentDoses.length > 0 || schedule.upcoming(1).length > 0
}

/**
 * Un vaccin compte tant que sa relance est programmée ; un traitement tant qu'il a une dose à venir ;
 * les deux pour un animal suivi seulement.
 */
export function hasUpcomingDueDates(
  { animals, vaccinations, treatments }: CarnetDueDates,
  today: string,
): boolean {
  const activeAnimals = new Set(
    animals
      .filter((animal) => animal.deletedAt === null && animal.unfollowedOn === null)
      .map((animal) => animal.id),
  )
  const lastRemindedDueDate = format(subDays(parseISO(today), DAYS_OVERDUE), 'yyyy-MM-dd')
  return (
    vaccinations.some(
      (vaccination) =>
        vaccination.deletedAt === null &&
        activeAnimals.has(vaccination.animalId) &&
        vaccination.dueDate !== null &&
        vaccination.dueDate >= lastRemindedDueDate,
    ) ||
    treatments.some(
      (treatment) => activeAnimals.has(treatment.animalId) && hasUpcomingDose(treatment, today),
    )
  )
}

export type RemindersPrimingDependencies = {
  isNativePlatform: () => boolean
  shouldShowPriming: () => Promise<boolean>
  animals: Provider<Pick<AnimalsRepository, 'list'>>
  vaccinations: Provider<Pick<VaccinationsRepository, 'listAll'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listAllWithHistory'>>
  today: () => string
}

export type PromptNotificationsIfReminders = (router: Router, from: string) => Promise<boolean>

export function createRemindersPriming({
  isNativePlatform,
  shouldShowPriming,
  animals,
  vaccinations,
  treatments,
  today,
}: RemindersPrimingDependencies): PromptNotificationsIfReminders {
  return async (router, from) => {
    try {
      if (!isNativePlatform() || !(await shouldShowPriming())) return false

      const [animalsRepository, vaccinationsRepository, treatmentsRepository] = await Promise.all([
        animals(),
        vaccinations(),
        treatments(),
      ])
      const [animalRows, vaccinationRows, treatmentRows] = await Promise.all([
        animalsRepository.list(),
        vaccinationsRepository.listAll(),
        treatmentsRepository.listAllWithHistory(),
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
 * que le carnet a une échéance à venir, sur appareil seulement. Sans effet si l'on a quitté `from` entre-temps ; ne lève jamais.
 */
export const promptNotificationsIfReminders = createRemindersPriming({
  isNativePlatform: () => Capacitor.isNativePlatform(),
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
