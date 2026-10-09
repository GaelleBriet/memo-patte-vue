/** `null` pour un champ vide ; `NaN` pour une saisie illisible, que le schéma refuse. */
export function numberOrNull(value: string): number | null {
  const trimmed = value.trim()

  return trimmed === '' ? null : Number(trimmed.replace(',', '.'))
}
