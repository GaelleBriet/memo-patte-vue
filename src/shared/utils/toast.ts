import { readonly, ref } from 'vue'

const current = ref<string | null>(null)

export const toastMessage = readonly(current)

/** Message bref affiché en bas d'écran, y compris après un changement de route. */
export function showToast(message: string): void {
  current.value = message
}

export function dismissToast(): void {
  current.value = null
}
