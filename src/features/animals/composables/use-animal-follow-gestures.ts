import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useGuardedGestures } from '@/shared/composables/use-guarded-gestures'
import { nextFollowedAnimalId } from '../logic/carnet-animal'
import type { Animal } from '../schema/animal.schema'
import { useAnimalsStore } from '../store/animals.store'

type Named = Pick<Animal, 'id' | 'name'>

/**
 * « Ne plus suivre », « Suivre de nouveau » et « Supprimer » depuis le Carnet, chacun confirmé par un
 * toast « Annuler ». Après « Ne plus suivre », retour à l'accueil (V15 bis) ; après « Supprimer », le
 * Carnet passe au premier animal suivi, ou à l'accueil. Chaque geste rend faux s'il a échoué.
 */
export function useAnimalFollowGestures() {
  const { t } = useI18n()
  const router = useRouter()
  const animals = useAnimalsStore()
  const { isBusy, guarded, undoable } = useGuardedGestures()

  function leave(animalId: string, { toHome = false } = {}): void {
    const next = nextFollowedAnimalId(animals.followedAnimals, animalId)
    animals.select(next)
    if (toHome || next === null) void router.push({ name: 'home' })
  }

  function unfollow({ id, name }: Named): Promise<boolean> {
    return guarded(async () => {
      const undo = await animals.unfollow(id)
      leave(id, { toHome: true })
      if (undo === null) return
      undoable(t('animals.carnet.toast.unfollowed', { name }), {
        ariaLabel: t('animals.carnet.toast.undoUnfollow', { name }),
        undo: () => animals.undoUnfollow(undo),
        onUndone: () => animals.select(id),
        announcement: t('animals.carnet.toast.unfollowedAnnouncement', { name }),
      })
    }, t('animals.carnet.toast.failed'))
  }

  function follow({ id, name }: Named): Promise<boolean> {
    return guarded(async () => {
      const undo = await animals.follow(id)
      if (undo === null) return
      undoable(t('animals.carnet.toast.followed', { name }), {
        ariaLabel: t('animals.carnet.toast.undoFollow', { name }),
        undo: () => animals.undoFollow(undo),
      })
    }, t('animals.carnet.toast.failed'))
  }

  /** La photo n'est effacée qu'une fois le toast fermé sans « Annuler ». */
  function remove({ id, name }: Named): Promise<boolean> {
    return guarded(
      async () => {
        const removal = await animals.remove(id)
        leave(id)
        if (removal === null) return
        undoable(t('animals.carnet.toast.deleted', { name }), {
          ariaLabel: t('animals.carnet.toast.undoDelete', { name }),
          undo: () => animals.undoRemove(removal),
          onUndone: () => animals.select(id),
          onExpired: () => void animals.forgetPhoto(removal),
        })
      },
      t('animals.carnet.toast.deleteFailed', { name }),
    )
  }

  return { isBusy, unfollow, follow, remove }
}
