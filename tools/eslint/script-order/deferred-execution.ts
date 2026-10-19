import type { Rule, Scope } from 'eslint'
import { CALLEE_GROUPS, G } from './groups.ts'

type Node = Rule.Node
type NodeOf<T extends Node['type']> = Extract<Node, { type: T }>

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

export function isEager(
  scope: Scope.Scope | null,
  moduleScope: Scope.Scope,
  statements: Node[],
): boolean {
  let current = scope
  while (current && current !== moduleScope) {
    if (current.type === 'function' && runsLater(current.block as Node, statements)) return false
    current = current.upper
  }
  return true
}
