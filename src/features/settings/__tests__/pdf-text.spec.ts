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

  it.each([
    ['Dvořák', 'Dvorák'],
    ['Şişli', 'Sisli'],
    ['Nguyễn', 'Nguyen'],
    ['Łucja Đorđević', 'Lucja Dordevic'],
    ['Işık', 'Isik'],
  ])(
    'garde la lettre sans son accent quand la police n’a pas la lettre accentuée : %s',
    (texte, attendu) => {
      expect(pdfText(texte)).toBe(attendu)
    },
  )

  it('garde l’accent des lettres que la police sait écrire', () => {
    expect(pdfText('Éloïse, Çağla, Øystein, Günther')).toBe('Éloïse, Çagla, Øystein, Günther')
  })

  it('retire un contrôle C1 au lieu de l’imprimer comme un signe de Windows-1252', () => {
    expect(pdfText('a\u0080b\u0082c\u0092d\u009fe')).toBe('abcde')
  })

  it('rend une chaîne vide quand il ne reste rien', () => {
    expect(pdfText('🐶 🐱')).toBe('')
  })
})
