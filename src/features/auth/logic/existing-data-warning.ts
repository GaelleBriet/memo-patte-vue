export function mustWarnBeforeSignIn({
  animalCount,
  hasAccount,
}: {
  animalCount: number | null
  hasAccount: boolean
}): boolean {
  if (hasAccount) return false
  return animalCount === null || animalCount > 0
}
