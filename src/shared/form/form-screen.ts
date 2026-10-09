export type FormFailure = 'notFound' | 'load' | 'save'

export type SubmitLabelKey = 'submit' | 'submitting' | 'save' | 'saving'

/** Le message d'échec d'un écran de formulaire : l'élément introuvable passe avant tout. */
export function formFailure(state: {
  notFound: boolean
  loadFailed?: boolean
  saveFailed: boolean
}): FormFailure | null {
  if (state.notFound) return 'notFound'
  if (state.loadFailed) return 'load'
  if (state.saveFailed) return 'save'
  return null
}

export function submitLabelKey(isEdit: boolean, isSubmitting: boolean): SubmitLabelKey {
  if (isSubmitting) return isEdit ? 'saving' : 'submitting'
  return isEdit ? 'save' : 'submit'
}
