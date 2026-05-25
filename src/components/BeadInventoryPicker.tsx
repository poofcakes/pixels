'use client'

import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useMemo, useState } from 'react'

import {
  getBeadPalette,
  getPaletteColorCount,
  type BeadPaletteId,
} from '@/lib/beadPalettes'
import {
  MARD_STOCK_SERIES,
  seriesEnabledState,
  toggleMardSeries,
} from '@/lib/mardStockSeries'
import { stockSummary } from '@/lib/beadStockStorage'
import { cn } from '@/lib/utils'

type BeadInventoryPickerProps = {
  paletteId: BeadPaletteId
  enabled: Set<string>
  onEnabledChange: (enabled: Set<string>) => void
  title?: string
}

export function BeadInventoryPicker({
  paletteId,
  enabled,
  onEnabledChange,
  title,
}: BeadInventoryPickerProps) {
  const t = useTranslations('pattern')
  const tMardSeries = useTranslations('colors.series')
  const [open, setOpen] = useState(false)
  const [swatchesOpen, setSwatchesOpen] = useState(false)
  const [query, setQuery] = useState('')

  const palette = getBeadPalette(paletteId)
  const total = getPaletteColorCount(paletteId)
  const summary = stockSummary(enabled, total)
  const isMard = paletteId === 'mard'

  const sortedColors = useMemo(
    () => [...palette.colors].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [palette.colors],
  )

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sortedColors
    return sortedColors.filter((c) => c.code.toLowerCase().includes(q))
  }, [sortedColors, query])

  const groupedBySeries = useMemo(() => {
    if (query.trim()) return null
    if (isMard) {
      return MARD_STOCK_SERIES.map((series) => ({
        ...series,
        colors: series.codes
          .map((code) => palette.colors.find((c) => c.code === code))
          .filter((c): c is (typeof palette.colors)[number] => Boolean(c)),
      })).filter((s) => s.colors.length > 0)
    }

    const groups = new Map<string, typeof sortedColors>()
    for (const color of sortedColors) {
      const id = /^([A-Z]+)/i.exec(color.code)?.[1]?.toUpperCase() ?? '#'
      const list = groups.get(id) ?? []
      groups.set(id, [...list, color])
    }

    return [...groups.entries()].map(([id, colors]) => ({
      id,
      codes: colors.map((c) => c.code),
      colors,
    }))
  }, [isMard, query, palette.colors, sortedColors])

  function toggle(code: string) {
    const next = new Set(enabled)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    onEnabledChange(next)
  }

  function selectAll() {
    onEnabledChange(new Set(palette.colors.map((c) => c.code)))
  }

  function clearAll() {
    onEnabledChange(new Set())
  }

  function seriesLabel(seriesId: string): string {
    try {
      return tMardSeries(seriesId as never)
    } catch {
      return seriesId
    }
  }

  function renderSwatch(color: { code: string; hex: string }) {
    const on = enabled.has(color.code)
    return (
      <li key={color.code}>
        <label
          className={cn(
            'flex cursor-pointer flex-col items-center gap-0.5 rounded-md border p-1 text-center transition-colors',
            on
              ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5'
              : 'border-black/10 opacity-50 hover:opacity-80',
          )}
          title={color.code}
        >
          <input
            type="checkbox"
            checked={on}
            onChange={() => toggle(color.code)}
            className="sr-only"
          />
          <span
            className="size-7 rounded border border-black/10"
            style={{ backgroundColor: color.hex }}
          />
          <span className="max-w-full truncate font-mono text-[10px] leading-tight">
            {color.code}
          </span>
        </label>
      </li>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-md border border-black/15 bg-white px-3 py-2 text-left text-sm hover:bg-black/[0.02]"
      >
        <span className="font-medium">{title ?? t('stockTitle')}</span>
        <span className="font-mono text-xs text-[var(--muted)]">
          {summary.allEnabled
            ? t('stockAll', { total })
            : t('stockCount', { enabled: summary.enabled, total })}
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 rounded-lg border border-black/10 bg-white/80 p-3">
          <p className="text-xs text-[var(--muted)]">
            {isMard ? t('stockHintMard') : t('stockHint')}
          </p>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5"
            >
              {t('stockSelectAll')}
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-md border border-black/15 px-2 py-1 text-xs hover:bg-black/5"
            >
              {t('stockClearAll')}
            </button>
          </div>

          {groupedBySeries && (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium">
                {isMard
                  ? t('stockMardSeriesTitle')
                  : t('stockSeriesTitle', { palette: palette.label })}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {groupedBySeries.map((series) => {
                  const state = seriesEnabledState(series.codes, enabled)
                  const onCount = series.codes.filter((c) => enabled.has(c)).length
                  return (
                    <button
                      key={series.id}
                      type="button"
                      title={t('stockMardSeriesToggle', {
                        series: series.id,
                        label: seriesLabel(series.id),
                      })}
                      onClick={() =>
                        onEnabledChange(toggleMardSeries(series.codes, enabled))
                      }
                      className={cn(
                        'rounded-md border px-2 py-1 font-mono text-xs tabular-nums transition-colors',
                        state === 'all' &&
                          'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--foreground)]',
                        state === 'some' &&
                          'border-[var(--accent)]/40 bg-[var(--accent)]/5 text-[var(--foreground)]',
                        state === 'none' &&
                          'border-black/10 text-[var(--muted)] opacity-60 hover:opacity-100',
                      )}
                    >
                      {series.id}
                      <span className="ml-1 text-[10px] opacity-70">
                        {onCount}/{series.codes.length}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setSwatchesOpen((v) => !v)}
            className="flex w-full items-center justify-between rounded-md border border-black/15 bg-white px-2.5 py-2 text-left text-xs hover:bg-black/[0.02]"
            aria-expanded={swatchesOpen}
          >
            <span className="font-medium">
              {swatchesOpen ? t('stockHideSwatches') : t('stockShowSwatches')}
            </span>
            <ChevronDown
              className={cn(
                'size-4 shrink-0 text-[var(--muted)] transition-transform',
                swatchesOpen && 'rotate-180',
              )}
              aria-hidden
            />
          </button>

          {swatchesOpen && (
            <>
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('stockSearch')}
                className="rounded-md border border-black/15 px-2 py-1.5 font-mono text-xs"
              />

              {groupedBySeries ? (
                <div className="flex max-h-64 flex-col gap-3 overflow-y-auto">
                  {groupedBySeries.map((series) => (
                    <section key={series.id}>
                      <h4 className="mb-1.5 flex items-baseline gap-2 text-xs font-medium">
                        <span className="font-mono">{series.id}</span>
                        <span className="text-[var(--muted)]">{seriesLabel(series.id)}</span>
                      </h4>
                      <ul
                        className="grid grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5"
                        role="list"
                      >
                        {series.colors.map(renderSwatch)}
                      </ul>
                    </section>
                  ))}
                </div>
              ) : (
                <ul
                  className="grid max-h-52 grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5 overflow-y-auto"
                  role="list"
                >
                  {filtered.map(renderSwatch)}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
