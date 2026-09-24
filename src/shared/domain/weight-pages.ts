export const WEIGHT_PAGE_SIZE = 12

/** Pesées `[start, end[` d'une page, indices dans l'ordre du temps. */
export type WeightPage = { start: number; end: number }

export type WeightPagePeriod = {
  from: string
  /** `null` quand la page tient dans le mois de `from`. */
  to: string | null
  count: number
  /** La page porte la toute première pesée. */
  isStart: boolean
}

/** Pages découpées depuis la pesée la plus récente, de la plus ancienne à la plus récente. */
export function weightPages(count: number, size = WEIGHT_PAGE_SIZE): WeightPage[] {
  const pages: WeightPage[] = []
  for (let end = count; end > 0; end -= size) {
    pages.unshift({ start: Math.max(0, end - size), end })
  }
  return pages
}

export function weightPagePeriod(
  entries: readonly { measuredOn: string }[],
  page: WeightPage,
): WeightPagePeriod {
  const from = entries[page.start]!.measuredOn
  const to = entries[page.end - 1]!.measuredOn
  return {
    from,
    to: to.slice(0, 7) === from.slice(0, 7) ? null : to,
    count: page.end - page.start,
    isStart: page.start === 0,
  }
}
