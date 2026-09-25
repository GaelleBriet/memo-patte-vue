import { describe, expect, it } from 'vitest'

import { pdfText } from '../logic/pdf-text'

describe('pdfText', () => {
  it('garde tel quel un texte que la police du PDF sait écrire', () => {
    const texte = 'Milbémax — 1,5 € · Œdème « Ÿ » ‰ ™ l’été'

    expect(pdfText(texte)).toBe(texte)
  })

  it.each([
    ['au milieu', 'Milo 🐶 Junior', 'Milo Junior'],
    ['au début', '🐶 Milo', 'Milo'],
    ['à la fin', 'Milo 🐶', 'Milo'],
    ['collé à un mot', 'Milo🐶🐱Luna', 'MiloLuna'],
    ['en séquence composée', 'Famille 👨‍👩‍👧 ❤️ 🇫🇷 👍🏽 ok', 'Famille ok'],
  ])('retire un emoji %s, sans laisser de double espace', (_, texte, attendu) => {
    expect(pdfText(texte)).toBe(attendu)
  })

  it('retire les autres caractères hors de Windows-1252', () => {
    expect(pdfText('Ωmega ≥ 3 → 漢字')).toBe('mega 3')
  })

  it('remplace par une espace un blanc hors de la police', () => {
    expect(pdfText('4 kg net\nici')).toBe('4 kg net ici')
  })

  it('recompose un accent saisi en deux caractères plutôt que de le perdre', () => {
    expect(pdfText('Cléo')).toBe('Cléo')
  })

  it('rend une chaîne vide quand il ne reste rien', () => {
    expect(pdfText('🐶 🐱')).toBe('')
  })
})
