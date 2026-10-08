// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { compileScript, parse } from 'vue/compiler-sfc'
import { describe, expect, it } from 'vitest'

const SRC = resolve(process.cwd(), 'src')
const REF_HOLDER = /^\s*(?:useTemplateRef|ref|shallowRef)\s*(?:<[\s\S]*>)?\s*\(/

function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : vueFiles(path)
    return entry.name.endsWith('.vue') ? [path] : []
  })
}

function staticTemplateRefs(template: string): string[] {
  return [...template.matchAll(/(?<![:\w-])ref="([A-Za-z_$][\w$]*)"/g)].map(([, name]) => name!)
}

function declaredWith(script: string, name: string): string | null {
  const declaration = new RegExp(
    `\\b(?:const|let)\\s+${name}\\s*(?::[^=]+)?=([\\s\\S]{0,80})`,
  ).exec(script)
  return declaration?.[1] ?? null
}

// En production, `ref="x"` devient `ref: x` : une fonction nommée x est appelée comme ref de fonction.
function misboundRefs(path: string): string[] {
  const { descriptor } = parse(readFileSync(path, 'utf8'), { filename: path })
  if (!descriptor.scriptSetup || !descriptor.template) return []
  const { bindings, imports } = compileScript(descriptor, { id: path, inlineTemplate: true })
  const script = descriptor.scriptSetup.content
  return staticTemplateRefs(descriptor.template.content).filter((name) => {
    if (bindings?.[name] === undefined) return false
    if (imports?.[name] !== undefined) return true
    const init = declaredWith(script, name)
    return init === null || !REF_HOLDER.test(init)
  })
}

describe('refs de template', () => {
  it('un ref="x" ne nomme jamais une variable du script qui ne porte pas la référence', () => {
    const found = vueFiles(SRC).flatMap((path) =>
      misboundRefs(path).map((name) => `${relative(process.cwd(), path)} : ref="${name}"`),
    )
    expect(found).toEqual([])
  })
})
