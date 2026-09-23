import { readonly, ref } from 'vue'

export type ToastOptions = {
  durationMs?: number
}

const DEFAULT_DURATION_MS = 3000
const ANNOUNCE_DELAY_MS = 100

const current = ref<string | null>(null)
const announcement = ref('')
let dismissTimer: ReturnType<typeof setTimeout> | undefined
let announceTimer: ReturnType<typeof setTimeout> | undefined

export const toastMessage = readonly(current)

/** Texte de la région annoncée, réécrit à chaque appel de `showToast`, même identique. */
export const toastAnnouncement = readonly(announcement)

/** Message bref affiché en bas d'écran, y compris après un changement de route ; chaque appel repart pour sa durée complète. */
export function showToast(message: string, options: ToastOptions = {}): void {
  clearTimeout(dismissTimer)
  clearTimeout(announceTimer)
  current.value = message
  announcement.value = ''
  // Vidé puis réécrit dans la même tâche, un texte identique n'est pas relu par les lecteurs d'écran.
  announceTimer = setTimeout(() => (announcement.value = message), ANNOUNCE_DELAY_MS)
  dismissTimer = setTimeout(dismissToast, options.durationMs ?? DEFAULT_DURATION_MS)
}

export function dismissToast(): void {
  clearTimeout(dismissTimer)
  clearTimeout(announceTimer)
  current.value = null
  announcement.value = ''
}
