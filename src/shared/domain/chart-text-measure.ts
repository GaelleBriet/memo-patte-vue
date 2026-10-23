/** Taille des textes de la courbe dans son style ; la chasse ci-dessous est mesurée à cette taille. */
export const CHART_FONT_PX = 12

export const LABEL_GAP = 1

/**
 * `textScale` : taille de police réellement rendue sur `CHART_FONT_PX`, au-delà de 1 si le système l'agrandit.
 * `textWidth` : largeur d'un texte à `CHART_FONT_PX` quand la police n'est pas Inter.
 */
export type ChartMeasure = {
  width?: number
  textScale?: number
  textWidth?: (text: string) => number
}

export type ChartText = { x: number; y: number; text: string }

export type ChartAnchor = 'start' | 'middle' | 'end'

/** Place estimée d'un texte écrit, pour qu'aucun ne chevauche son voisin. */
export type ChartBox = { left: number; right: number; top: number; bottom: number }

export type ChartLabel = ChartText & { anchor: ChartAnchor; box: ChartBox }

// Chasse d'Inter à 12 px, mesurée et arrondie au dixième supérieur ; un glyphe absent compte 8 px.
const GLYPH_WIDTHS = new Map(
  (
    [
      [' \u00a0il', 3.2],
      ['.,', 3.9],
      ['t', 4.3],
      ['r', 4.8],
      ['1', 5.1],
      ['s', 6.6],
      ['akx', 6.9],
      ['7Jc', 7],
      ['vFéey', 7.1],
      ['5nuoû', 7.4],
      ['2pb', 7.5],
      ['g', 7.6],
      ['3689', 7.7],
      ['S', 7.8],
      ['04', 8],
      ['D', 8.7],
      ['A', 8.8],
      ['N', 9.2],
      ['O', 9.3],
      ['m', 10.8],
      ['M', 11.1],
    ] as const
  ).flatMap(([glyphs, width]) => [...glyphs].map((glyph) => [glyph, width] as const)),
)
const DEFAULT_GLYPH_WIDTH = 8
const TEXT_ASCENT = 9
const TEXT_DESCENT = 3

function interWidth(text: string): number {
  return [...text].reduce((sum, glyph) => sum + (GLYPH_WIDTHS.get(glyph) ?? DEFAULT_GLYPH_WIDTH), 0)
}

export type ChartFont = { width: (text: string) => number; ascent: number; descent: number }

export function chartFont({ textScale = 1, textWidth = interWidth }: ChartMeasure): ChartFont {
  return {
    width: (text) => textWidth(text) * textScale,
    ascent: TEXT_ASCENT * textScale,
    descent: TEXT_DESCENT * textScale,
  }
}

export function textBox(
  x: number,
  y: number,
  anchor: ChartAnchor,
  text: string,
  font: ChartFont,
): ChartBox {
  const width = font.width(text)
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2
  return {
    left,
    right: left + width,
    top: y - font.ascent,
    bottom: y + font.descent,
  }
}

export function overlaps(a: ChartBox, b: ChartBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}
