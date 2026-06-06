import { MARD_COLOR_SERIES } from '@/lib/mardColors'

export type MardStockSeries = {
  id: string
  codes: readonly string[]
}

export type MardStockCatalogId = 'all' | '221' | '264'

export type MardStockCatalog = {
  id: MardStockCatalogId
  labelKey: 'stockMardCatalogAll' | 'stockMardCatalog221' | 'stockMardCatalog264'
  codes: readonly string[]
}

export const MARD_STOCK_SERIES: readonly MardStockSeries[] = MARD_COLOR_SERIES.map((s) => ({
  id: s.id,
  codes: s.colors.map((c) => c.code),
}))

function seriesCodes(seriesId: string, from: number, to: number): string[] {
  const out: string[] = []
  for (let i = from; i <= to; i += 1) out.push(`${seriesId}${i}`)
  return out
}

const allMardCodes = MARD_COLOR_SERIES.flatMap((s) => s.colors.map((c) => c.code))

export const MARD_STOCK_CATALOGS: readonly MardStockCatalog[] = [
  {
    id: 'all',
    labelKey: 'stockMardCatalogAll',
    codes: allMardCodes,
  },
  {
    id: '221',
    labelKey: 'stockMardCatalog221',
    codes: [
      ...seriesCodes('A', 1, 26),
      ...seriesCodes('B', 1, 32),
      ...seriesCodes('C', 1, 29),
      ...seriesCodes('D', 1, 26),
      ...seriesCodes('E', 1, 24),
      ...seriesCodes('F', 1, 25),
      ...seriesCodes('G', 1, 21),
      ...seriesCodes('H', 1, 23),
      ...seriesCodes('M', 1, 15),
    ],
  },
  {
    id: '264',
    labelKey: 'stockMardCatalog264',
    codes: [
      ...seriesCodes('A', 1, 26),
      ...seriesCodes('B', 1, 32),
      ...seriesCodes('C', 1, 29),
      ...seriesCodes('D', 1, 26),
      ...seriesCodes('E', 1, 24),
      ...seriesCodes('F', 1, 25),
      ...seriesCodes('G', 1, 21),
      ...seriesCodes('H', 1, 23),
      ...seriesCodes('M', 1, 15),
      ...seriesCodes('P', 1, 23),
      'Q2',
      'Q5',
      ...seriesCodes('R', 1, 13),
      'T1',
      ...seriesCodes('Y', 1, 5),
    ],
  },
] as const

const MARD_STOCK_CATALOG_BY_ID = new Map<MardStockCatalogId, MardStockCatalog>(
  MARD_STOCK_CATALOGS.map((catalog) => [catalog.id, catalog] as const),
)

export function getMardStockCatalog(id: MardStockCatalogId): MardStockCatalog {
  return MARD_STOCK_CATALOG_BY_ID.get(id) ?? MARD_STOCK_CATALOGS[0]
}

export type SeriesEnabledState = 'all' | 'some' | 'none'

export function seriesEnabledState(
  codes: readonly string[],
  enabled: ReadonlySet<string>,
): SeriesEnabledState {
  let on = 0
  for (const code of codes) {
    if (enabled.has(code)) on++
  }
  if (on === 0) return 'none'
  if (on === codes.length) return 'all'
  return 'some'
}

/** If every code in the series is on, turn all off; otherwise turn all on. */
export function toggleMardSeries(codes: readonly string[], enabled: ReadonlySet<string>): Set<string> {
  const next = new Set(enabled)
  const turnOn = seriesEnabledState(codes, enabled) !== 'all'
  for (const code of codes) {
    if (turnOn) next.add(code)
    else next.delete(code)
  }
  return next
}
