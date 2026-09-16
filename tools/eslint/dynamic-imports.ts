import type { ESLint, Rule } from 'eslint'
import { builtinRules } from 'eslint/use-at-your-own-risk'

const noRestrictedImports = builtinRules.get('no-restricted-imports')

if (!noRestrictedImports) {
  throw new Error('Règle ESLint « no-restricted-imports » introuvable : API interne changée.')
}

/**
 * `no-restricted-imports` ne visite que les déclarations : elle laisse passer
 * `await import('…')`. On lui repasse l'expression telle quelle, pour que les
 * motifs et les messages restent ceux de la configuration.
 */
const rule: Rule.RuleModule = {
  meta: noRestrictedImports.meta,
  create(context) {
    const checkDeclaration = noRestrictedImports.create(context).ImportDeclaration
    if (!checkDeclaration) return {}

    return {
      ImportExpression(node) {
        if (node.source.type !== 'Literal' || typeof node.source.value !== 'string') return
        checkDeclaration(node as unknown as Parameters<typeof checkDeclaration>[0])
      },
    }
  },
}

// Deux noms pour la même règle : en flat config, deux blocs qui déclarent la
// même règle sur un même fichier s'écrasent au lieu de se cumuler.
export default {
  rules: {
    'no-restricted-dynamic-imports': rule,
    'no-restricted-dynamic-feature-imports': rule,
  },
} satisfies ESLint.Plugin
