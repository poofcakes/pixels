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
  getMardStockCatalog,
  MARD_STOCK_CATALOGS,
  type MardStockCatalogId,
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
  mardCatalogId?: MardStockCatalogId
  onMardCatalogChange?: (catalogId: MardStockCatalogId) => void
}

export function BeadInventoryPicker({
  paletteId,
  enabled,
  onEnabledChange,
  title,
  mardCatalogId = 'all',
  onMardCatalogChange,
}: BeadInventoryPickerProps) {
  const t = useTranslations('pattern')
  const tMardSeries = useTranslations('colors.series')
  const [open, setOpen] = useState(false)
  const [swatchesOpen, setSwatchesOpen] = useState(false)
  const [query, setQuery] = useState('')

  const palette = getBeadPalette(paletteId)
  const isMard = paletteId === 'mard'
  const activeMardCatalog = getMardStockCatalog(mardCatalogId)
  const activeCodeSet = useMemo(
    () => (isMard ? new Set(activeMardCatalog.codes) : null),
    [activeMardCatalog, isMard],
  )
  const activeColors = useMemo(
    () => palette.colors.filter((color) => !activeCodeSet || activeCodeSet.has(color.code)),
    [activeCodeSet, palette.colors],
  )
  const total = isMard ? activeColors.length : getPaletteColorCount(paletteId)
  const enabledInActiveCatalog = useMemo(
    () =>
      activeCodeSet
        ? new Set([...enabled].filter((code) => activeCodeSet.has(code)))
        : enabled,
    [activeCodeSet, enabled],
  )
  const summary = stockSummary(enabledInActiveCatalog, total)

  const sortedColors = useMemo(
    () => [...activeColors].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    [activeColors],
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
        codes: series.codes.filter((code) => !activeCodeSet || activeCodeSet.has(code)),
        colors: series.codes
          .filter((code) => !activeCodeSet || activeCodeSet.has(code))
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
  }, [activeCodeSet, isMard, query, palette, sortedColors])

  function toggle(code: string) {
    const next = new Set(enabled)
    if (next.has(code)) next.delete(code)
    else next.add(code)
    onEnabledChange(next)
  }

  function selectAll() {
    onEnabledChange(new Set(activeColors.map((c) => c.code)))
  }

  function clearAll() {
    onEnabledChange(new Set())
  }

  function preserveViewportAfterLayoutChange(): void {
    const scrollY = window.scrollY
    const restore = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      window.scrollTo({ top: Math.min(scrollY, maxScroll), behavior: 'auto' })
    }

    requestAnimationFrame(restore)
    window.setTimeout(restore, 0)
  }

  function toggleSwatchesOpen(): void {
    preserveViewportAfterLayoutChange()
    setSwatchesOpen((v) => !v)
  }

  function seriesLabel(seriesId: string): string {
    try {
      return tMardSeries(seriesId as never)
    } catch {
      return seriesId
    }
  }

  function selectMardCatalog(catalogId: MardStockCatalogId) {
    const catalog = getMardStockCatalog(catalogId)
    onMardCatalogChange?.(catalogId)
    onEnabledChange(new Set(catalog.codes))
  }

  function renderSwatch(color: { code: string; hex: string }) {
    const on = enabled.has(color.code)
    return (
      <li key={color.code}>
        <label
          className={cn(
            'relative flex cursor-pointer flex-col items-center gap-0.5 rounded-md border p-1 text-center transition-colors',
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
            className="absolute inset-0 cursor-pointer opacity-0"
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
    <div className="flex flex-col gap-2 [overflow-anchor:none]">
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

          {isMard && (
            <label className="flex flex-col gap-1 text-xs font-medium">
              {t('stockMardCatalogTitle')}
              <select
                value={mardCatalogId}
                onChange={(event) => selectMardCatalog(event.target.value as MardStockCatalogId)}
                className="rounded-md border border-black/15 bg-white px-2 py-1.5 text-xs font-normal"
              >
                {MARD_STOCK_CATALOGS.map((catalog) => (
                  <option key={catalog.id} value={catalog.id}>
                    {t(catalog.labelKey)} ({catalog.codes.length})
                  </option>
                ))}
              </select>
            </label>
          )}

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
            onClick={toggleSwatchesOpen}
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
            <div className="flex max-h-[22rem] min-h-0 flex-col gap-3 overflow-hidden rounded-md border border-black/10 bg-white/70 p-2 [overflow-anchor:none]">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('stockSearch')}
                className="shrink-0 rounded-md border border-black/15 px-2 py-1.5 font-mono text-xs"
              />

              {groupedBySeries ? (
                <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
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
                  className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(4.5rem,1fr))] gap-1.5 overflow-y-auto pr-1"
                  role="list"
                >
                  {filtered.map(renderSwatch)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
