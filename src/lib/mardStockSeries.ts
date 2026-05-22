import { MARD_COLOR_SERIES } from '@/lib/mardColors'

export type MardStockSeries = {
  id: string
  codes: readonly string[]
}

export const MARD_STOCK_SERIES: readonly MardStockSeries[] = MARD_COLOR_SERIES.map((s) => ({
  id: s.id,
  codes: s.colors.map((c) => c.code),
}))

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
