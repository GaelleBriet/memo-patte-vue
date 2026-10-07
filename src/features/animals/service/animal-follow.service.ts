import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import {
  getTreatmentPeriodsRepository,
  type TreatmentPeriodsRepository,
} from '@/features/treatments/repository/treatment-periods.repository'
import {
  getTreatmentsRepository,
  type TreatmentWithHistory,
  type TreatmentsRepository,
} from '@/features/treatments/repository/treatments.repository'
import { readableTreatmentSchedule } from '@/shared/domain/readable-treatment-schedule'
import { getAnimalsRepository, type AnimalsRepository } from '../repository/animals.repository'
import type { Departure } from '../schema/animal.schema'
import { animalRemindersService, type AnimalRemindersService } from './animal-reminders.service'

type Provider<T> = () => T | Promise<T>

export type AnimalFollowDependencies = {
  animals: Provider<Pick<AnimalsRepository, 'getDeparture' | 'setDeparture'>>
  treatments: Provider<Pick<TreatmentsRepository, 'listWithHistoryByAnimal'>>
  periods: Provider<
    Pick<TreatmentPeriodsRepository, 'stopPeriodStatement' | 'undoStopPeriodStatement'>
  >
  reminders: Pick<AnimalRemindersService, 'withdraw' | 'reschedule'>
  today: () => string
}

/** Ce que « Annuler » défait après « Ne plus suivre ». */
export type UnfollowUndo = { animalId: string; unfollowedOn: string; stoppedPeriodIds: string[] }

/** Ce que « Annuler » remet après « Suivre de nouveau ». */
export type FollowUndo = { animalId: string; departure: Departure }

const FOLLOWED: Departure = { unfollowedOn: null, departureReason: null, departureDate: null }

/** La période en cours d'un traitement ni arrêté ni fini par sa date de fin. */
function ongoingPeriodId(treatment: TreatmentWithHistory, today: string): string | null {
  const current = treatment.periods.at(-1)
  if (current === undefined || current.stoppedOn !== null) return null
  const schedule = readableTreatmentSchedule({ ...treatment, today })
  return schedule?.phase === 'ended' ? null : current.id
}

export function createAnimalFollowService({
  animals,
  treatments,
  periods,
  reminders,
  today,
}: AnimalFollowDependencies) {
  async function departureOf(animalId: string): Promise<Departure> {
    const departure = await (await animals()).getDeparture(animalId)
    if (departure === null) throw new Error(`Animal introuvable : ${animalId}`)
    return departure
  }

  return {
    /**
     * AN-9, AN-11 : l'animal n'est plus suivi et ses traitements en cours sont arrêtés aujourd'hui,
     * en une transaction, puis ses rappels sont retirés. `null` s'il n'était déjà plus suivi.
     */
    async unfollow(animalId: string): Promise<UnfollowUndo | null> {
      if ((await departureOf(animalId)).unfollowedOn !== null) return null
      const day = today()
      const at = new Date().toISOString()
      const histories = await (await treatments()).listWithHistoryByAnimal(animalId)
      const stoppedPeriodIds = histories.flatMap((treatment) => {
        const id = ongoingPeriodId(treatment, day)
        return id === null ? [] : [id]
      })
      const repository = await periods()
      await (
        await animals()
      ).setDeparture(
        animalId,
        { ...FOLLOWED, unfollowedOn: day },
        stoppedPeriodIds.map((id) => repository.stopPeriodStatement(id, day, at)),
      )
      await reminders.withdraw(animalId)
      return { animalId, unfollowedOn: day, stoppedPeriodIds }
    },

    /** Suivi rétabli avec les seules périodes arrêtées par `unfollow`, puis les rappels. */
    async undoUnfollow({ animalId, unfollowedOn, stoppedPeriodIds }: UnfollowUndo): Promise<void> {
      const at = new Date().toISOString()
      const repository = await periods()
      await (
        await animals()
      ).setDeparture(
        animalId,
        FOLLOWED,
        stoppedPeriodIds.map((id) => repository.undoStopPeriodStatement(id, unfollowedOn, at)),
      )
      await reminders.reschedule(animalId)
    },

    /**
     * AN-11 : motif et date du départ effacés, traitements laissés arrêtés, rappels reprogrammés.
     * `null` s'il était déjà suivi.
     */
    async follow(animalId: string): Promise<FollowUndo | null> {
      const departure = await departureOf(animalId)
      if (departure.unfollowedOn === null) return null
      await (await animals()).setDeparture(animalId, FOLLOWED)
      await reminders.reschedule(animalId)
      return { animalId, departure }
    },

    async undoFollow({ animalId, departure }: FollowUndo): Promise<void> {
      await (await animals()).setDeparture(animalId, departure)
      await reminders.withdraw(animalId)
    },
  }
}

export type AnimalFollowService = ReturnType<typeof createAnimalFollowService>

export const animalFollowService = createAnimalFollowService({
  animals: getAnimalsRepository,
  treatments: getTreatmentsRepository,
  periods: getTreatmentPeriodsRepository,
  reminders: animalRemindersService,
  today: todayIsoDate,
})
