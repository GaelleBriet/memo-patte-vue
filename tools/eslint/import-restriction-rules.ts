import type { Linter } from 'eslint'

// Chaque interdit d'import est posé deux fois : la règle d'ESLint pour les
// déclarations, la nôtre pour `import()` qu'elle ne visite pas.
export function restrictImports(options: object): Linter.RulesRecord {
  const entry: Linter.RuleEntry = ['error', options]
  return { 'no-restricted-imports': entry, 'app/no-restricted-dynamic-imports': entry }
}

export function restrictFeatureImports(options: object): Linter.RulesRecord {
  const entry: Linter.RuleEntry = ['error', options]
  return {
    '@typescript-eslint/no-restricted-imports': entry,
    'app/no-restricted-dynamic-feature-imports': entry,
  }
}
