import { readonly, ref } from 'vue'

export type ToastOptions = {
  durationMs?: number
}

const DEFAULT_DURATION_MS = 3000

const current = ref<string | null>(null)
const currentDurationMs = ref(DEFAULT_DURATION_MS)
let dismissTimer: ReturnType<typeof setTimeout> | undefined

export const toastMessage = readonly(current)

export const toastDurationMs = readonly(currentDurationMs)

/** Message bref affiché en bas d'écran, y compris après un changement de route ; chaque appel repart pour sa durée complète. */
export function showToast(message: string, options: ToastOptions = {}): void {
  clearTimeout(dismissTimer)
  current.value = message
  currentDurationMs.value = options.durationMs ?? DEFAULT_DURATION_MS
  dismissTimer = setTimeout(dismissToast, currentDurationMs.value)
}

export function dismissToast(): void {
  clearTimeout(dismissTimer)
  current.value = null
}
