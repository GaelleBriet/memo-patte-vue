const MM_PER_PT = 25.4 / 72
const A4_HEIGHT_MM = 297

/** Texte écrit sur la page : `left` et `baseline` en mm depuis le coin haut gauche. */
export type PdfText = {
  text: string
  bold: boolean
  sizePt: number
  color: string
  left: number
  baseline: number
}

/** Tracé peint : `paint` est l'opérateur PDF (`S` trait, `f` fond, `B` les deux). */
export type PdfPath = {
  paint: string
  stroke: string
  fill: string
  lineWidth: number
  points: { x: number; y: number }[]
}

export type PdfBounds = { left: number; right: number; top: number; bottom: number }

function hex(components: number[]): string {
  const [r, g, b] =
    components.length === 1 ? [components[0]!, components[0]!, components[0]!] : components
  return `#${[r!, g!, b!]
    .map((value) =>
      Math.round(value * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase()}`
}

function fontStyles(source: string): Map<string, boolean> {
  const baseFonts = new Map<string, string>()
  for (const [, id, name] of source.matchAll(
    /(\d+) 0 obj\s*<<\s*\/Type \/Font\s*\/BaseFont \/(\S+)/g,
  )) {
    baseFonts.set(id!, name!)
  }
  const styles = new Map<string, boolean>()
  for (const [, key, id] of source.matchAll(/\/(F\d+) (\d+) 0 R/g)) {
    styles.set(key!, baseFonts.get(id!)?.includes('Bold') ?? false)
  }
  return styles
}

/** Lit la première page d'un PDF produit par jsPDF, non compressé. */
export function readPdf(bytes: Uint8Array): { texts: PdfText[]; paths: PdfPath[] } {
  const source = new TextDecoder('latin1').decode(bytes)
  const bold = fontStyles(source)
  const content = /stream\r?\n([\s\S]*?)\r?\nendstream/.exec(source)![1]!
  const mm = (pt: number) => pt * MM_PER_PT
  const point = (x: number, y: number) => ({ x: mm(x), y: A4_HEIGHT_MM - mm(y) })

  const texts: PdfText[] = []
  const paths: PdfPath[] = []
  let fill = '#000000'
  let stroke = '#000000'
  let lineWidth = 0
  let font = ''
  let sizePt = 0
  let origin = { x: 0, y: 0 }
  let points: PdfPath['points'] = []

  for (const line of content.split(/\r?\n/)) {
    const shown = /^\((.*)\) Tj$/.exec(line)
    if (shown) {
      texts.push({
        text: shown[1]!.replace(/\\(.)/g, '$1'),
        bold: bold.get(font) ?? false,
        sizePt,
        color: fill,
        left: mm(origin.x),
        baseline: A4_HEIGHT_MM - mm(origin.y),
      })
      continue
    }
    const operands = line.trim().split(/\s+/)
    const operator = operands.pop()
    const n = operands.map(Number)
    switch (operator) {
      case 'Tf':
        font = operands[0]!.slice(1)
        sizePt = n[1]!
        break
      case 'Td':
        origin = { x: n[0]!, y: n[1]! }
        break
      case 'rg':
      case 'g':
        fill = hex(n)
        break
      case 'RG':
      case 'G':
        stroke = hex(n)
        break
      case 'w':
        lineWidth = mm(n[0]!)
        break
      case 'm':
      case 'l':
        points.push(point(n[0]!, n[1]!))
        break
      case 'c':
        points.push(point(n[0]!, n[1]!), point(n[2]!, n[3]!), point(n[4]!, n[5]!))
        break
      case 'S':
      case 'f':
      case 'f*':
      case 'B':
      case 'B*':
        paths.push({ paint: operator, stroke, fill, lineWidth, points })
        points = []
        break
    }
  }
  return { texts, paths }
}

export function bounds(points: readonly { x: number; y: number }[]): PdfBounds {
  const xs = points.map((point) => point.x)
  const ys = points.map((point) => point.y)
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  }
}
