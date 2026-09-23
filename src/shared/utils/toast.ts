import { computed, readonly, ref } from 'vue'

export type ToastOptions = {
  durationMs?: number
}

const DEFAULT_DURATION_MS = 3000

const current = ref<string | null>(null)
const currentOptions = ref<ToastOptions>({})

export const toastMessage = readonly(current)

export const toastDurationMs = computed(
  () => currentOptions.value.durationMs ?? DEFAULT_DURATION_MS,
)

/** Message bref affiché en bas d'écran, y compris après un changement de route. */
export function showToast(message: string, options: ToastOptions = {}): void {
  current.value = message
  currentOptions.value = options
}

export function dismissToast(): void {
  current.value = null
}
