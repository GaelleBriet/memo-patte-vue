import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { beforeAll, describe, expect, it } from 'vitest'

// Vitest tourne avec `css: false` : ce fichier compile le bloc `<style>` et
// vérifie des déclarations, jamais la géométrie — jsdom ne met pas en page.
const COMPOSANT = resolve(process.cwd(), 'src/features/home/views/HomePhotosStatus.vue')
const DOSSIER_STYLES = resolve(process.cwd(), 'src/styles')

let css: string

beforeAll(() => {
  const sfc = readFileSync(COMPOSANT, 'utf8')
  const bloc = /<style scoped lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]
  if (!bloc) throw new Error('bloc <style scoped lang="scss"> introuvable')
  css = compileString(bloc.replaceAll("@use '@/styles/", "@use '"), {
    loadPaths: [DOSSIER_STYLES],
  }).css
})

function declaration(selecteur: string, propriete: string): string | undefined {
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim() !== selecteur) continue
    const trouvee = new RegExp(`(?:^|[;\\s])${propriete}\\s*:\\s*([^;]+)`).exec(regle[2]!)
    if (trouvee) return trouvee[1]!.trim()
  }
  return undefined
}

describe('ligne des photos en cours de téléchargement : aucune place prise dans l’accueil', () => {
  it('le conteneur reste dans le flux sans hauteur ni marge, ligne affichée ou non', () => {
    expect(declaration('.home-photos-status', 'height')).toBe('0')
    expect(declaration('.home-photos-status', 'margin')).toBe('0')
  })

  it('la ligne se pose sur l’écart existant, sans le pousser', () => {
    expect(declaration('.home-photos-status__line', 'position')).toBe('absolute')
    expect(
      Number.parseInt(declaration('.home-photos-status__line', 'top')!, 10),
    ).toBeLessThanOrEqual(2)
    expect(declaration('.home-photos-status__line', 'height')).toBe('16px')
  })
})
