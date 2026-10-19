import type { Rule } from 'eslint'
import { CALLEE_GROUPS, G } from './groups.ts'

type Node = Rule.Node
type NodeOf<T extends Node['type']> = Extract<Node, { type: T }>

const WRAPPERS = new Set([
  'AwaitExpression',
  'ChainExpression',
  'TSAsExpression',
  'TSNonNullExpression',
  'TSSatisfiesExpression',
])

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

export function groupOf(statement: Node): number | null {
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

export function macroName(statement: Node): string {
  const name = calleeName(initializer(statement)) ?? ''
  return name === 'withDefaults' ? 'defineProps' : name
}

export function macroRank(statement: Node): number {
  const name = macroName(statement)
  if (name === 'defineProps') return 0
  return name === 'defineEmits' ? 1 : 2
}
