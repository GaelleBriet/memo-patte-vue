// @vitest-environment node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { describe, expect, it } from 'vitest'

function css(): string {
  const sfc = readFileSync(resolve(process.cwd(), 'src/shared/components/AnimalAvatar.vue'), 'utf8')
  const bloc = /<style[^>]*lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]
  if (!bloc) throw new Error('bloc <style lang="scss"> introuvable dans AnimalAvatar.vue')
  return compileString(bloc).css
}

function declaration(feuille: string, selecteur: string, propriete: string): string | undefined {
  for (const regle of feuille.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue
    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }
  return undefined
}

describe('AnimalAvatar — contrat de style', () => {
  const feuille = css()

  it('découpe la photo dans un rond, sans la déformer', () => {
    expect(declaration(feuille, '.animal-avatar', 'border-radius')).toBe('50%')
    expect(declaration(feuille, '.animal-avatar', 'overflow')).toBe('hidden')
    expect(declaration(feuille, '.animal-avatar img', 'object-fit')).toBe('cover')
  })
})
