// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function singleFileComponents(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((entree) => {
    const chemin = join(dossier, entree.name)
    if (entree.isDirectory()) return singleFileComponents(chemin)
    return entree.name.endsWith('.vue') ? [chemin] : []
  })
}

function blocsNonScopes(fichier: string): string[] {
  const sfc = readFileSync(fichier, 'utf8')
  return [...sfc.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)]
    .filter(([, attributs]) => !attributs!.includes('scoped'))
    .map(([, , contenu]) => contenu!)
}

// `:deep()` n'est réécrit que dans un bloc scopé : ailleurs, il sort tel quel dans
// le CSS et la règle est jetée par le navigateur, sans que rien n'échoue.
describe('`:deep()` hors d’un bloc scopé', () => {
  it.each(singleFileComponents(resolve(process.cwd(), 'src')))('%s', (fichier) => {
    expect(blocsNonScopes(fichier).filter((bloc) => bloc.includes(':deep('))).toEqual([])
  })
})
