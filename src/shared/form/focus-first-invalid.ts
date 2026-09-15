const FOCUSABLE = 'input, textarea, select, button, [tabindex="0"]'

/** Focalise le premier contrôle `aria-invalid="true"` de `root`, ou la première option d'un groupe invalide. */
export function focusFirstInvalid(root: ParentNode): void {
  const invalid = root.querySelector<HTMLElement>('[aria-invalid="true"]')
  if (!invalid) return
  const target = invalid.matches(FOCUSABLE)
    ? invalid
    : invalid.querySelector<HTMLElement>(FOCUSABLE)
  target?.focus()
}
