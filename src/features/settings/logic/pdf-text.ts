const WINDOWS_1252_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ'

const UNDECOMPOSABLE: Record<string, string> = {
  Ł: 'L',
  ł: 'l',
  Đ: 'D',
  đ: 'd',
  Ħ: 'H',
  ħ: 'h',
  ı: 'i',
}

function isInPdfFont(char: string): boolean {
  const code = char.codePointAt(0)!
  return (
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xa0 && code <= 0xff) ||
    WINDOWS_1252_EXTRAS.includes(char)
  )
}

function withoutAccent(char: string): string {
  const base = char.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC')
  if (base !== '' && [...base].every(isInPdfFont)) return base
  return UNDECOMPOSABLE[char] ?? ''
}

/**
 * Le texte tel que la police standard du PDF sait l'écrire : un seul caractère hors de
 * Windows-1252 rendrait toute la chaîne illisible.
 */
export function pdfText(text: string): string {
  return [...text.normalize('NFC')]
    .map((char) => {
      if (isInPdfFont(char)) return char
      return /\s/u.test(char) ? ' ' : withoutAccent(char)
    })
    .join('')
    .replace(/ {2,}/g, ' ')
    .trim()
}
