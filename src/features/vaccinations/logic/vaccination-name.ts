function comparable(name: string): string {
  return name
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
}

/** Même vaccin : espaces en bord, casse et accents ne comptent pas. */
export function isSameVaccineName(a: string, b: string): boolean {
  return comparable(a) === comparable(b)
}
