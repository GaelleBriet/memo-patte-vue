import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileString } from 'sass'
import { beforeAll, describe, expect, it } from 'vitest'

// Vitest tourne avec `css: false` : ce fichier compile le bloc `<style>` et
// vérifie des déclarations, jamais la géométrie — jsdom ne met pas en page.
const COMPOSANT = resolve(process.cwd(), 'src/features/home/views/HomeTodoCard.vue')
const DOSSIER_STYLES = resolve(process.cwd(), 'src/styles')

function cssDuComposant(): string {
  const sfc = readFileSync(COMPOSANT, 'utf8')
  const bloc = /<style scoped lang="scss">([\s\S]*?)<\/style>/.exec(sfc)?.[1]

  if (!bloc) throw new Error('bloc <style scoped lang="scss"> introuvable')

  const scss = bloc.replaceAll("@use '@/styles/", "@use '")

  return compileString(scss, { loadPaths: [DOSSIER_STYLES] }).css
}

let css: string

beforeAll(() => {
  css = cssDuComposant()
})

function declaration(selecteur: string, propriete: string): string | undefined {
  for (const regle of css.matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    if (regle[1]!.trim().replace(/\s+/g, ' ') !== selecteur) continue

    return new RegExp(`(?:^|;)\\s*${propriete}:\\s*([^;]+)`).exec(regle[2]!)?.[1]?.trim()
  }

  return undefined
}

describe('HomeTodoCard — contrat de style', () => {
  it('écarte l’icône du texte de 14 px dans une ligne de rappel', () => {
    expect(declaration('.reminder-row', 'gap')).toBe('14px')
  })

  it('renvoie un titre de rappel trop long à la ligne sans couper le mot en deux', () => {
    expect(declaration('.reminder-row__title', 'overflow-wrap')).toBe('break-word')
  })

  it('fait passer le badge sous le titre quand les deux ne tiennent plus côte à côte', () => {
    expect(declaration('.reminder-row', 'flex-wrap')).toBe('wrap')
    expect(declaration('.reminder-row__badge', 'margin-inline-start')).toBe('auto')
  })

  it('colore la barre d’urgence selon le statut', () => {
    expect(declaration('.reminder-row--overdue::before', 'background')).toBe(
      'rgb(var(--v-theme-overdue))',
    )
    expect(declaration('.reminder-row--today::before', 'background')).toBe(
      'rgb(var(--v-theme-today))',
    )
    expect(
      declaration('.reminder-row--tomorrow::before, .reminder-row--later::before', 'background'),
    ).toBe('rgb(var(--v-theme-soon))')
  })

  it('peint le bandeau retard en rose pâle', () => {
    expect(declaration('.home-overdue-banner', 'background')).toBe(
      'rgb(var(--v-theme-overdue-container))',
    )
    expect(declaration('.home-overdue-banner', 'color')).toBe(
      'rgb(var(--v-theme-on-overdue-container))',
    )
  })

  it('donne 46 px à la pastille « Tout est à jour », en vert distinct de « Bientôt »', () => {
    expect(declaration('.home-up-to-date__dot', 'width')).toBe('46px')
    expect(declaration('.home-up-to-date__dot', 'background')).toBe(
      'rgb(var(--v-theme-up-to-date))',
    )
    expect(declaration('.home-up-to-date__dot', 'color')).toBe('rgb(var(--v-theme-on-up-to-date))')
  })

  it('range « À renseigner » sous une bande grise en capitales, comme la maquette V16', () => {
    expect(declaration('.home-todo__group', 'background')).toBe('#f2f0ec')
    expect(declaration('.home-todo__group', 'color')).toBe('#68625c')
    expect(declaration('.home-todo__group', 'font-size')).toBe('11.5px')
    expect(declaration('.home-todo__group', 'text-transform')).toBe('uppercase')
  })

  it('borde une ligne « À renseigner » de turquoise, jamais de la teinte d’un retard (TR-14)', () => {
    expect(declaration('.reminder-row--to-log::before', 'background')).toBe('#b9e4e7')
  })

  it('écrit le nombre de doses non renseignées en pétrole sous le type', () => {
    expect(declaration('.reminder-row__unlogged', 'color')).toBe('rgb(var(--v-theme-primary))')
    expect(declaration('.reminder-row__unlogged', 'font-size')).toBe('12.5px')
  })
})
