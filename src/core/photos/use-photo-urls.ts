import { reactive, watch } from 'vue'

import { photoDisplayUrl } from './photo-storage'

// Un nom de photo n'est jamais réutilisé : son URL reste valable pour toute la session.
const urls = reactive(new Map<string, string>())
const pending = new Set<string>()

export function forgetPhotoUrls(): void {
  urls.clear()
  pending.clear()
}

async function resolve(name: string): Promise<void> {
  if (urls.has(name) || pending.has(name)) return
  pending.add(name)
  try {
    urls.set(name, await photoDisplayUrl(name))
  } catch {
    pending.delete(name)
  }
}

/** Résout les photos listées ; l'URL rendue est `null` tant qu'elle n'est pas prête. */
export function usePhotoUrls(names: () => readonly (string | null)[]) {
  watch(
    names,
    (list) => {
      for (const name of list) if (name !== null) void resolve(name)
    },
    { immediate: true },
  )

  return (name: string | null): string | null => (name === null ? null : (urls.get(name) ?? null))
}
