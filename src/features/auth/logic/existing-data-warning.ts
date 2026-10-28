export function mustWarnBeforeSignIn({
  animalCount,
  hasAccount,
}: {
  animalCount: number
  hasAccount: boolean
}): boolean {
  return animalCount > 0 && !hasAccount
}
