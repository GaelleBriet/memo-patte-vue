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

function literalPatterns(arg: Expr | undefined): string[] {
  if (!arg) return []
  if (arg.type === 'Literal' && typeof arg.value === 'string') return [arg.value]
  if (arg.type === 'TemplateLiteral') return [arg.quasis?.[0]?.value.cooked ?? '']
  if (arg.type === 'ArrayExpression') {
    return ((arg as unknown as { elements: Expr[] }).elements ?? []).flatMap(literalPatterns)
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

const WILDCARD = /[*?[\]{}]/

function isBroadGlob(pattern: string) {
  const directories = pattern.split('/').slice(0, -1)
  return directories.some((segment) => segment === '**' || WILDCARD.test(segment))
}

function excludesTests(negatives: string[]) {
  const text = negatives.join(' ')
  return text.includes('__tests__') && text.includes('spec') && text.includes('test')
}

const testFilesRule: Rule.RuleModule = {
  meta: noRestrictedImports.meta,
  create(context) {
    let reported = 0
    const counting = Object.create(context, {
      report: {
        value: (descriptor: Rule.ReportDescriptor) => {
          reported++
          context.report(descriptor)
        },
      },
    }) as Rule.RuleContext
    const checkDeclaration = noRestrictedImports.create(counting).ImportDeclaration as
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
        if (node.source.type !== 'TemplateLiteral') return
        const { quasis, expressions } = node.source
        const first = quasis[0]?.value.cooked ?? ''
        if (expressions.length === 0) return check(node as Rule.Node, first)
        if (first) check(node as Rule.Node, first)
        const last = quasis[quasis.length - 1]?.value.cooked ?? ''
        if (last) check(node as Rule.Node, `x${last}`)
      },
      CallExpression(node) {
        if (!isImportMetaGlob(node.callee)) return
        const patterns = literalPatterns(node.arguments[0] as Expr | undefined)
        const positives = patterns.filter((pattern) => !pattern.startsWith('!'))
        const negatives = patterns.filter((pattern) => pattern.startsWith('!'))
        reported = 0
        for (const pattern of positives) check(node as Rule.Node, pattern)
        if (reported === 0 && !excludesTests(negatives) && positives.some(isBroadGlob)) {
          context.report({
            node,
            message:
              "Un glob large de production embarquerait des specs : ajoute les motifs négatifs '!**/__tests__/**' et '!**/*.{spec,test}.*'.",
          })
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
