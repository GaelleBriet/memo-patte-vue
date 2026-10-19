import type { AST, Rule, Scope, SourceCode } from 'eslint'
import { isEager } from './deferred-execution.ts'
import { G } from './groups.ts'
import { groupOf } from './statement-group.ts'

type Node = Rule.Node

export interface Entry {
  node: Node
  /** `null` : un appel que la règle ne sait pas ranger ; il n'est pas vérifié. */
  group: number | null
  /** Index des instructions dont l'initialisation de celle-ci lit la valeur. */
  dependsOn: Set<number>
}

function isWithin(inner: { range?: [number, number] }, outer: { range?: [number, number] }) {
  const [start, end] = inner.range ?? [0, 0]
  const [outerStart, outerEnd] = outer.range ?? [0, 0]
  return start >= outerStart && end <= outerEnd
}

interface VueElement {
  type: string
  name?: string
  range: [number, number]
  startTag?: { attributes: { key: { name: unknown } }[] }
}

function scriptSetupElement(sourceCode: SourceCode): VueElement | undefined {
  const services = sourceCode.parserServices as {
    getDocumentFragment?: () => { children: VueElement[] } | null
  }
  return services
    .getDocumentFragment?.()
    ?.children.find(
      (element) =>
        element.type === 'VElement' &&
        element.name === 'script' &&
        element.startTag?.attributes.some((attribute) => attribute.key.name === 'setup'),
    )
}

/** Instructions du `<script setup>`, avec leur groupe et ce dont leur initialisation a besoin. */
export function analyzeScriptSetup(sourceCode: SourceCode, program: AST.Program): Entry[] {
  const setup = scriptSetupElement(sourceCode)
  const moduleScope = sourceCode.scopeManager?.scopes.find((scope) => scope.type === 'module')
  if (!setup || !moduleScope) return []

  const statements = (program.body as Node[]).filter((statement) => isWithin(statement, setup))
  const indexOf = (node: Node) => statements.findIndex((statement) => isWithin(node, statement))

  const references: { identifier: Node; from: Scope.Scope; definedIn: number }[] = []
  const visit = (scope: Scope.Scope) => {
    for (const reference of scope.references) {
      const definition = reference.resolved?.defs[0]?.node as Node | undefined
      if (reference.resolved?.scope !== moduleScope || !definition) continue
      const definedIn = indexOf(definition)
      if (definedIn >= 0) {
        references.push({
          identifier: reference.identifier as Node,
          from: reference.from,
          definedIn,
        })
      }
    }
    scope.childScopes.forEach(visit)
  }
  visit(moduleScope)

  const entries: Entry[] = statements.map((node) => ({
    node,
    group: groupOf(node),
    dependsOn: new Set(),
  }))

  const functionBodies = new Map<number, number[]>()
  entries.forEach((entry, index) => {
    if (entry.group !== G.functions && entry.group !== G.computed) return
    functionBodies.set(
      index,
      references
        .filter((r) => r.definedIn !== index && isWithin(r.identifier, entry.node))
        .map((r) => r.definedIn),
    )
  })

  entries.forEach((entry, index) => {
    if (entry.group === G.functions) return
    // Tout ce qu'un composable reçoit peut servir tout de suite, même un `computed`.
    const everything = entry.group === G.tools
    const queue = references
      .filter(
        (r) =>
          r.definedIn !== index &&
          isWithin(r.identifier, entry.node) &&
          (everything || isEager(r.from, moduleScope, statements)),
      )
      .map((r) => r.definedIn)
    const seen = new Set<number>([index])
    while (queue.length > 0) {
      const next = queue.pop() as number
      if (seen.has(next)) continue
      seen.add(next)
      if (statements[next]?.type !== 'FunctionDeclaration') entry.dependsOn.add(next)
      queue.push(...(functionBodies.get(next) ?? []))
    }
  })

  for (const entry of entries) {
    const { type } = entry.node
    if (entry.group !== G.constants) continue
    if (type !== 'VariableDeclaration' && type !== 'ExpressionStatement') continue
    const derived = references.some(
      (r) =>
        isWithin(r.identifier, entry.node) &&
        (entries[r.definedIn]?.group ?? G.state) > G.constants,
    )
    const isLet = entry.node.type === 'VariableDeclaration' && entry.node.kind !== 'const'
    if (isLet || derived) entry.group = G.state
  }

  return entries
}

/**
 * Groupe à partir duquel une instruction peut venir sans lire une valeur pas encore
 * déclarée : le sien, ou le plus haut de ceux dont son initialisation a besoin.
 */
export function effectiveGroups(entries: Entry[]): (number | null)[] {
  const result: (number | null)[] = []
  entries.forEach((entry, index) => {
    let group = entry.group
    for (const dependency of entry.dependsOn) {
      const needed = dependency < index ? result[dependency] : null
      if (needed !== null && needed !== undefined && (group === null || needed > group)) {
        group = needed
      }
    }
    result.push(group)
  })
  return result
}
