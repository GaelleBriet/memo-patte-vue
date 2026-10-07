import type { Animal } from '../schema/animal.schema'
import { animalAgeText } from '@/shared/domain/animal-age'
import { formatLongDate } from '@/shared/utils/format'

type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

/** Animal affiché par le Carnet quand `leavingId` le quitte ; `null` : il ne reste aucun animal suivi. */
export function nextFollowedAnimalId(
  followed: readonly { id: string }[],
  leavingId: string,
): string | null {
  return followed.find(({ id }) => id !== leavingId)?.id ?? null
}

/** AN-7, AN-10 : « race · âge », ou « jusqu'au … » une fois la date du départ saisie. */
export function carnetSubtitle(
  t: Translate,
  animal: Pick<
    Animal,
    'breed' | 'birthDate' | 'birthDateApproximate' | 'unfollowedOn' | 'departureDate'
  >,
  today: string,
): string | null {
  if (animal.unfollowedOn !== null && animal.departureDate !== null) {
    return t('animals.carnet.until', { date: formatLongDate(animal.departureDate) })
  }
  const { breed, birthDate, birthDateApproximate } = animal
  const age = animalAgeText(t, { birthDate, approximate: birthDateApproximate }, today)
  return [breed, age].filter(Boolean).join(t('animals.carnet.subtitleSeparator')) || null
}

export type UnfollowedEntry = {
  count: number
  target: { kind: 'carnet'; animalId: string } | { kind: 'list' }
}

/** AN-10 : la ligne « Animaux que tu ne suis plus (N) » ouvre le carnet s'il n'y en a qu'un. */
export function unfollowedEntry(unfollowed: readonly { id: string }[]): UnfollowedEntry | null {
  const [only] = unfollowed
  if (only === undefined) return null
  return {
    count: unfollowed.length,
    target: unfollowed.length === 1 ? { kind: 'carnet', animalId: only.id } : { kind: 'list' },
  }
}
