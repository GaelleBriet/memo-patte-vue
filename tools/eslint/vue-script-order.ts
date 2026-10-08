import type { AST, Rule, Scope, SourceCode } from 'eslint'

type Node = Rule.Node
type NodeOf<T extends Node['type']> = Extract<Node, { type: T }>

export const GROUPS = [
  'imports',
  'types et constantes',
  'macros (defineProps, defineEmits…)',
  'outils (useI18n, stores, composables)',
  'état (ref, reactive…)',
  'computed',
  'watch',
  'fonctions',
  'cycle de vie (onMounted…)',
  'defineExpose',
] as const

const G = {
  imports: 0,
  constants: 1,
  macros: 2,
  tools: 3,
  state: 4,
  computed: 5,
  watch: 6,
  functions: 7,
  lifecycle: 8,
  expose: 9,
} as const

const CALLEE_GROUPS: Record<string, number> = {
  defineAsyncComponent: G.constants,
  defineProps: G.macros,
  withDefaults: G.macros,
  defineEmits: G.macros,
  defineModel: G.macros,
  defineSlots: G.macros,
  defineOptions: G.macros,
  ref: G.state,
  reactive: G.state,
  shallowRef: G.state,
  shallowReactive: G.state,
  useTemplateRef: G.state,
  useId: G.state,
  toRef: G.state,
  toRefs: G.state,
  inject: G.state,
  computed: G.computed,
  watch: G.watch,
  watchEffect: G.watch,
  watchPostEffect: G.watch,
  watchSyncEffect: G.watch,
  onBeforeMount: G.lifecycle,
  onMounted: G.lifecycle,
  onBeforeUpdate: G.lifecycle,
  onUpdated: G.lifecycle,
  onBeforeUnmount: G.lifecycle,
  onUnmounted: G.lifecycle,
  onActivated: G.lifecycle,
  onDeactivated: G.lifecycle,
  onErrorCaptured: G.lifecycle,
  onRenderTracked: G.lifecycle,
  onRenderTriggered: G.lifecycle,
  onServerPrefetch: G.lifecycle,
  onScopeDispose: G.lifecycle,
  onBeforeRouteLeave: G.lifecycle,
  onBeforeRouteUpdate: G.lifecycle,
  defineExpose: G.expose,
}

const WRAPPERS = new Set([
  'AwaitExpression',
  'ChainExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
])

export interface Entry {
  node: Node
  /** `null` : un appel que la règle ne sait pas ranger ; il n'est pas vérifié. */
  group: number | null
  /** Index des instructions dont l'initialisation de celle-ci lit la valeur. */
  dependsOn: Set<number>
}

function unwrap(node: Node | null | undefined): Node | null | undefined {
  let current = node
  while (current && WRAPPERS.has(current.type)) {
    const inner = current as unknown as { argument?: Node; expression?: Node }
    current = inner.argument ?? inner.expression
  }
  return current
}

function calleeName(node: Node | null | undefined): string | null {
  const call = unwrap(node)
  if (call?.type !== 'CallExpression' || call.callee.type !== 'Identifier') return null
  return call.callee.name
}

/** Nom de l'appel en tête d'une chaîne : `useRoute` pour `useRoute().query`. */
function rootCallName(node: Node | null | undefined): string | null {
  let current = unwrap(node)
  while (current) {
    if (current.type === 'CallExpression') {
      if (current.callee.type === 'Identifier') return current.callee.name
      current = unwrap(current.callee as Node)
    } else if (current.type === 'MemberExpression') {
      current = unwrap(current.object as Node)
    } else {
      return null
    }
  }
  return null
}

/** Un appel inconnu est d'abord une constante ; il passe à l'état s'il lit autre chose que des imports. */
function groupOfCall(name: string | null): number {
  if (name === null) return G.constants
  if (name in CALLEE_GROUPS) return CALLEE_GROUPS[name] ?? G.constants
  return /^use[A-Z]/.test(name) ? G.tools : G.constants
}

function isTypeExport(statement: Node): boolean {
  if (statement.type !== 'ExportNamedDeclaration') return false
  const { declaration, exportKind } = statement as NodeOf<'ExportNamedDeclaration'> & {
    exportKind?: string
  }
  return exportKind === 'type' || (declaration?.type.startsWith('TS') ?? false)
}

function groupOf(statement: Node): number | null {
  const type = statement.type as string
  if (type === 'ImportDeclaration') return G.imports
  if (type.startsWith('TS') || isTypeExport(statement)) return G.constants
  if (type === 'FunctionDeclaration') return G.functions
  if (statement.type === 'ExpressionStatement') {
    return groupOfCall(rootCallName(statement.expression as Node))
  }
  if (statement.type === 'VariableDeclaration') {
    if (statement.declarations.length !== 1) return null
    const init = unwrap(statement.declarations[0]?.init as Node | null | undefined)
    if (!init) return G.state
    if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
      return G.functions
    }
    if (init.type === 'NewExpression') return G.state
    return groupOfCall(rootCallName(init))
  }
  return null
}

function initializer(statement: Node): Node | null | undefined {
  if (statement.type === 'ExpressionStatement') return statement.expression as Node
  if (statement.type === 'VariableDeclaration') return statement.declarations[0]?.init as Node
  return null
}

/**
 * Parties de l'instruction lancées pendant le setup, fonctions comprises : tout un composable ou
 * un `watchEffect`, la source d'un `watch`, et son rappel s'il est `immediate`.
 */
function runsDuringSetup(statement: Node, group: number | null): Node[] {
  if (group === G.tools) return [statement]
  const expression = initializer(statement)
  const name = calleeName(expression)
  if (name === 'watchEffect' || name === 'watchSyncEffect') return [statement]
  if (name !== 'watch') return []
  const [source, callback, options] = (unwrap(expression) as NodeOf<'CallExpression'>).arguments
  const parts = [source as Node]
  if (isImmediate(options as Node | undefined)) parts.push(callback as Node)
  return parts.filter(Boolean)
}

function isImmediate(options: Node | undefined): boolean {
  return (
    options?.type === 'ObjectExpression' &&
    options.properties.some(
      (property) =>
        property.type === 'Property' &&
        property.key.type === 'Identifier' &&
        property.key.name === 'immediate' &&
        property.value.type === 'Literal' &&
        property.value.value === true,
    )
  )
}

function isWithin(inner: { range?: [number, number] }, outer: { range?: [number, number] }) {
  const [start, end] = inner.range ?? [0, 0]
  const [outerStart, outerEnd] = outer.range ?? [0, 0]
  return start >= outerStart && end <= outerEnd
}

function crossesFunction(scope: Scope.Scope | null, moduleScope: Scope.Scope): boolean {
  let current = scope
  while (current && current !== moduleScope) {
    if (current.type === 'function') return true
    current = current.upper
  }
  return false
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
    const eager = runsDuringSetup(entry.node, entry.group)
    const queue = references
      .filter(
        (r) =>
          r.definedIn !== index &&
          isWithin(r.identifier, entry.node) &&
          (!crossesFunction(r.from, moduleScope) ||
            eager.some((part) => isWithin(r.identifier, part))),
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

function macroName(statement: Node): string {
  const name = calleeName(initializer(statement)) ?? ''
  return name === 'withDefaults' ? 'defineProps' : name
}

function macroRank(statement: Node): number {
  const name = macroName(statement)
  if (name === 'defineProps') return 0
  return name === 'defineEmits' ? 1 : 2
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
