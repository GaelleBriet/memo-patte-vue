import { readonly, ref, shallowRef } from 'vue'

/** `success` : réussite ; `info` : ni réussite ni échec ; `error` : échec. */
export type ToastTone = 'success' | 'info' | 'error'

/** Bouton du toast, qui agit sur ce que le toast confirme (« Annuler », « Ouvrir »). */
export type ToastAction = {
  label: string
  /** Nom lu par le lecteur d'écran quand le libellé seul ne dit pas sur quoi il agit. */
  ariaLabel?: string
  run: () => void
}

export type ToastOptions = {
  durationMs?: number
  tone?: ToastTone
  action?: ToastAction
}

const DEFAULT_DURATION_MS = 3000
const ACTION_DURATION_MS = 4000
const ANNOUNCE_DELAY_MS = 100

const current = ref<string | null>(null)
const currentTone = ref<ToastTone>('success')
const currentAction = shallowRef<ToastAction | null>(null)
const announcement = ref('')
let durationMs = DEFAULT_DURATION_MS
let dismissTimer: ReturnType<typeof setTimeout> | undefined
let announceTimer: ReturnType<typeof setTimeout> | undefined

export const toastMessage = readonly(current)

export const toastTone = readonly(currentTone)

export const toastAction = readonly(currentAction)

/** Texte de la région annoncée, réécrit à chaque appel de `showToast`, même identique. */
export const toastAnnouncement = readonly(announcement)

/**
 * Message bref affiché en bas d'écran, y compris après un changement de route ; chaque appel repart
 * pour sa durée complète et remplace le toast précédent, action comprise.
 */
export function showToast(message: string, options: ToastOptions = {}): void {
  clearTimeout(dismissTimer)
  clearTimeout(announceTimer)
  current.value = message
  currentTone.value = options.tone ?? 'success'
  currentAction.value = options.action ?? null
  announcement.value = ''
  // Vidé puis réécrit dans la même tâche, un texte identique n'est pas relu par les lecteurs d'écran.
  announceTimer = setTimeout(() => (announcement.value = message), ANNOUNCE_DELAY_MS)
  durationMs = options.durationMs ?? (options.action ? ACTION_DURATION_MS : DEFAULT_DURATION_MS)
  dismissTimer = setTimeout(dismissToast, durationMs)
}

export function dismissToast(): void {
  clearTimeout(dismissTimer)
  clearTimeout(announceTimer)
  current.value = null
  currentAction.value = null
  announcement.value = ''
}

/** Le toast reste affiché tant que son action a le focus. */
export function pauseToast(): void {
  clearTimeout(dismissTimer)
}

export function resumeToast(): void {
  if (current.value === null) return
  clearTimeout(dismissTimer)
  dismissTimer = setTimeout(dismissToast, durationMs)
}

export type UndoOptions = {
  label: string
  ariaLabel: string
  undo: () => Promise<unknown>
  onUndone: () => void
  /** Affiché en toast d'échec si l'annulation lève. */
  failedMessage: string
}

/** Confirme un geste réversible ; « Annuler » le défait. */
export function showUndoableToast(message: string, options: UndoOptions): void {
  showToast(message, {
    action: {
      label: options.label,
      ariaLabel: options.ariaLabel,
      run: () =>
        void options
          .undo()
          .then(options.onUndone, () => showToast(options.failedMessage, { tone: 'error' })),
    },
  })
}

/** Ferme le toast puis joue son action, une seule fois. */
export function runToastAction(): void {
  const action = currentAction.value
  if (action === null) return
  dismissToast()
  action.run()
}
