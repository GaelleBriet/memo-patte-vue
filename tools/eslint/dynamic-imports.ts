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

const staticAndDynamicRule: Rule.RuleModule = {
  meta: noRestrictedImports.meta,
  create(context) {
    return { ...noRestrictedImports.create(context), ...rule.create(context) }
  },
}

type Checker = NonNullable<ReturnType<typeof noRestrictedImports.create>['ImportDeclaration']>
type Expr = { type: string; value?: unknown; quasis?: { value: { cooked?: string | null } }[] }

function staticPrefix(arg: Expr | undefined): string[] {
  if (!arg) return []
  if (arg.type === 'Literal' && typeof arg.value === 'string') return [arg.value]
  if (arg.type === 'TemplateLiteral') return [arg.quasis?.[0]?.value.cooked ?? '']
  if (arg.type === 'ArrayExpression') {
    return ((arg as unknown as { elements: Expr[] }).elements ?? []).flatMap(staticPrefix)
  }
  return []
}

function isImportMetaGlob(callee: { type: string; object?: unknown; property?: unknown }) {
  const { object, property } = callee as {
    object?: { type: string; meta?: { name: string }; property?: { name: string } }
    property?: { type: string; name?: string }
  }
  return (
    callee.type === 'MemberExpression' &&
    object?.type === 'MetaProperty' &&
    object.meta?.name === 'import' &&
    property?.name === 'glob'
  )
}

const testFilesRule: Rule.RuleModule = {
  meta: noRestrictedImports.meta,
  create(context) {
    const checkDeclaration = noRestrictedImports.create(context).ImportDeclaration as
      Checker | undefined
    if (!checkDeclaration) return {}

    const check = (node: Rule.Node, path: string) => {
      const source = { type: 'Literal', value: path, raw: JSON.stringify(path) }
      checkDeclaration({
        ...node,
        type: 'ImportDeclaration',
        source,
      } as unknown as Parameters<Checker>[0])
    }

    return {
      ImportExpression(node) {
        if (node.source.type === 'TemplateLiteral' && node.source.expressions.length > 0) {
          const prefix = node.source.quasis[0]?.value.cooked ?? ''
          if (prefix) check(node as Rule.Node, prefix)
        }
      },
      CallExpression(node) {
        if (!isImportMetaGlob(node.callee)) return
        for (const pattern of staticPrefix(node.arguments[0] as Expr | undefined)) {
          if (!pattern.startsWith('!')) check(node as Rule.Node, pattern)
        }
      },
    }
  },
}

const testImportsRule: Rule.RuleModule = {
  meta: noRestrictedImports.meta,
  create(context) {
    const literal = staticAndDynamicRule.create(context)
    const computed = testFilesRule.create(context)
    return {
      ...literal,
      ...computed,
      ImportExpression(node) {
        literal.ImportExpression?.(node)
        computed.ImportExpression?.(node)
      },
    }
  },
}

// Plusieurs noms pour la même règle : en flat config, deux blocs qui déclarent la
// même règle sur un même fichier s'écrasent au lieu de se cumuler.
export default {
  rules: {
    'no-restricted-dynamic-imports': rule,
    'no-restricted-dynamic-feature-imports': rule,
    'no-restricted-engine-imports': staticAndDynamicRule,
    'no-restricted-interface-imports': staticAndDynamicRule,
    'no-restricted-test-imports': testImportsRule,
  },
} satisfies ESLint.Plugin
