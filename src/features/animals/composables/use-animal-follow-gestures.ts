import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { showToast, showUndoableToast } from '@/shared/utils/toast'
import { nextFollowedAnimalId } from '../logic/carnet-animal'
import type { Animal } from '../schema/animal.schema'
import { useAnimalsStore } from '../store/animals.store'

type Named = Pick<Animal, 'id' | 'name'>

/**
 * « Ne plus suivre », « Suivre de nouveau » et « Supprimer » depuis le Carnet, chacun confirmé par un
 * toast « Annuler ». L'animal qui quitte le Carnet laisse la place au premier animal suivi, ou à
 * l'accueil. Chaque geste rend faux s'il a échoué, échec dit en toast.
 */
export function useAnimalFollowGestures() {
  const { t } = useI18n()
  const router = useRouter()
  const animals = useAnimalsStore()
  const isBusy = ref(false)

  async function guarded(action: () => Promise<void>, failed: string): Promise<boolean> {
    if (isBusy.value) return false
    isBusy.value = true
    try {
      await action()
      return true
    } catch {
      showToast(failed, { tone: 'error' })
      return false
    } finally {
      isBusy.value = false
    }
  }

  function leave(animalId: string): void {
    const next = nextFollowedAnimalId(animals.followedAnimals, animalId)
    animals.select(next)
    if (next === null) void router.push({ name: 'home' })
  }

  function undoable(
    message: string,
    ariaLabel: string,
    undo: () => Promise<unknown>,
    options: { onUndone?: () => void; onExpired?: () => void } = {},
  ): void {
    showUndoableToast(message, {
      label: t('reminderSheet.undo'),
      ariaLabel,
      undo,
      onUndone: options.onUndone ?? (() => {}),
      onExpired: options.onExpired,
      failedMessage: t('reminderSheet.undoFailed'),
    })
  }

  function unfollow({ id, name }: Named): Promise<boolean> {
    return guarded(async () => {
      const undo = await animals.unfollow(id)
      leave(id)
      if (undo === null) return
      undoable(
        t('animals.carnet.toast.unfollowed', { name }),
        t('animals.carnet.toast.undoUnfollow', { name }),
        () => animals.undoUnfollow(undo),
        { onUndone: () => animals.select(id) },
      )
    }, t('animals.carnet.toast.failed'))
  }

  function follow({ id, name }: Named): Promise<boolean> {
    return guarded(async () => {
      const undo = await animals.follow(id)
      if (undo === null) return
      undoable(
        t('animals.carnet.toast.followed', { name }),
        t('animals.carnet.toast.undoFollow', { name }),
        () => animals.undoFollow(undo),
      )
    }, t('animals.carnet.toast.failed'))
  }

  /** La photo n'est effacée qu'une fois le toast fermé sans « Annuler ». */
  function remove({ id, name }: Named): Promise<boolean> {
    return guarded(
      async () => {
        const removal = await animals.remove(id)
        leave(id)
        if (removal === null) return
        undoable(
          t('animals.carnet.toast.deleted', { name }),
          t('animals.carnet.toast.undoDelete', { name }),
          () => animals.undoRemove(removal),
          {
            onUndone: () => animals.select(id),
            onExpired: () => void animals.forgetPhoto(removal),
          },
        )
      },
      t('animals.carnet.toast.deleteFailed', { name }),
    )
  }

  return { isBusy, unfollow, follow, remove }
}
