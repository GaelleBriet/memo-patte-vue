import type { AST, Rule, SourceCode } from 'eslint'
import { G, GROUPS } from './script-order/groups.ts'
import { macroName, macroRank } from './script-order/statement-group.ts'
import {
  analyzeScriptSetup,
  effectiveGroups,
  type Entry,
} from './script-order/initialization-dependencies.ts'

type Node = Rule.Node

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
