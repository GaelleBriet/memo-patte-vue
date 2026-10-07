import { computed } from 'vue'
import { useRouter } from 'vue-router'

import { unfollowedEntry } from '../domain/unfollowed-animals'

/** AN-10 : la ligne « Animaux que tu ne suis plus (N) » et ce qu'elle ouvre. */
export function useOpenUnfollowed(
  unfollowed: () => readonly { id: string }[],
  openCarnet: (animalId: string) => void,
) {
  const router = useRouter()
  const entry = computed(() => unfollowedEntry(unfollowed()))

  function open(): void {
    const target = entry.value?.target
    if (target?.kind === 'list') void router.push({ name: 'unfollowed-animals' })
    else if (target) openCarnet(target.animalId)
  }

  return { entry, open }
}
