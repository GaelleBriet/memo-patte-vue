import type { AST, Rule, Scope, SourceCode } from 'eslint'
import { CALLEE_GROUPS, G, GROUPS } from './script-order/groups.ts'
import { groupOf, macroName, macroRank } from './script-order/statement-group.ts'

type Node = Rule.Node
type NodeOf<T extends Node['type']> = Extract<Node, { type: T }>

export interface Entry {
  node: Node
  /** `null` : un appel que la règle ne sait pas ranger ; il n'est pas vérifié. */
  group: number | null
  /** Index des instructions dont l'initialisation de celle-ci lit la valeur. */
  dependsOn: Set<number>
}

/**
 * Rappel d'un `watch` lancé au setup, sauf options en objet littéral du fichier, sans `...`, dont
 * `immediate` est absent ou vaut `false`.
 */
function isImmediate(options: Node | undefined, statements: Node[]): boolean {
  let object = options
  if (options?.type === 'Identifier') {
    const declarator = statements
      .flatMap((statement) =>
        statement.type === 'VariableDeclaration' ? statement.declarations : [],
      )
      .find((d) => d.id.type === 'Identifier' && d.id.name === options.name)
    object = declarator?.init as Node | undefined
    if (!object) return true
  }
  if (object === undefined) return false
  if (object.type !== 'ObjectExpression') return true
  return object.properties.some(
    (property) =>
      property.type !== 'Property' ||
      property.computed ||
      (keyName(property.key as Node) === 'immediate' &&
        !(property.value.type === 'Literal' && property.value.value === false)),
  )
}

function keyName(key: Node): unknown {
  return key.type === 'Identifier' ? key.name : key.type === 'Literal' ? key.value : null
}

function calledBy(fn: Node): { call: NodeOf<'CallExpression'>; position: number } | null {
  let argument = fn
  let parent = fn.parent as Node | undefined
  if (parent?.type === 'Property' && parent.value === fn) {
    argument = parent.parent as Node
    parent = argument.parent as Node | undefined
  }
  if (parent?.type !== 'CallExpression') return null
  const position = parent.arguments.indexOf(argument as never)
  return position < 0 ? null : { call: parent, position }
}

/**
 * Toute fonction peut être lancée au setup, sauf aux places connues pour attendre : getter d'un
 * `computed`, chargeur de `defineAsyncComponent`, cycle de vie et `nextTick`, rappel d'un `watch`
 * non immédiat.
 */
function runsLater(fn: Node, statements: Node[]): boolean {
  const found = calledBy(fn)
  if (!found || found.call.callee.type !== 'Identifier') return false
  const name = found.call.callee.name
  const direct = found.call.arguments[found.position] === fn
  if (name === 'computed') {
    const reader = found.call.parent as Node | undefined
    return !(reader?.type === 'MemberExpression' && reader.object === found.call)
  }
  if (!direct) return false
  if (name === 'defineAsyncComponent' || CALLEE_GROUPS[name] === G.lifecycle) return true
  if (name !== 'watch' || found.position !== 1) return false
  return !isImmediate(found.call.arguments[2] as Node | undefined, statements)
}

function isEager(scope: Scope.Scope | null, moduleScope: Scope.Scope, statements: Node[]): boolean {
  let current = scope
  while (current && current !== moduleScope) {
    if (current.type === 'function' && runsLater(current.block as Node, statements)) return false
    current = current.upper
  }
  return true
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

function hasBlankLineBefore(sourceCode: SourceCode, previous: Node, next: Node): boolean {
  const from = previous.loc?.end.line ?? 0
  const firstComment = sourceCode.getCommentsBefore(next as unknown as AST.Token)[0]
  const to = firstComment?.loc?.start.line ?? next.loc?.start.line ?? 0
  for (let line = from + 1; line < to; line++) {
    if ((sourceCode.lines[line - 1] ?? '').trim() === '') return true
  }
  return false
}

const rule: Rule.RuleModule = {
  meta: {
    type: 'suggestion',
    docs: { description: 'Ordre des déclarations d’un <script setup>' },
    schema: [],
    messages: {
      order: 'Ordre du <script setup> : « {{current}} » doit venir avant « {{previous}} ».',
      blankLine: 'Ligne vide attendue entre « {{previous}} » et « {{current}} ».',
    },
  },
  create(context) {
    return {
      'Program:exit'(program) {
        const entries = analyzeScriptSetup(context.sourceCode, program as AST.Program)
        const effective = effectiveGroups(entries)
        let highest = -1
        let highestMacro = -1
        let highestMacroName = ''
        let previous: Entry | null = null
        entries.forEach((entry, index) => {
          const group = entry.group
          if (group === null) {
            previous = null
            return
          }
          if ((effective[index] ?? group) < highest) {
            context.report({
              node: entry.node,
              messageId: 'order',
              data: { current: GROUPS[group], previous: GROUPS[highest] },
            })
          } else if (group === G.macros && macroRank(entry.node) < highestMacro) {
            context.report({
              node: entry.node,
              messageId: 'order',
              data: { current: macroName(entry.node), previous: highestMacroName },
            })
          } else if (
            previous !== null &&
            previous.group !== null &&
            previous.group !== group &&
            !hasBlankLineBefore(context.sourceCode, previous.node, entry.node)
          ) {
            context.report({
              node: entry.node,
              messageId: 'blankLine',
              data: { previous: GROUPS[previous.group], current: GROUPS[group] },
            })
          }
          highest = Math.max(highest, group)
          if (group === G.macros && macroRank(entry.node) > highestMacro) {
            highestMacro = macroRank(entry.node)
            highestMacroName = macroName(entry.node)
          }
          previous = entry
        })
      },
    }
  },
}

export default rule
