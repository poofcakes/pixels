'use client'

import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { BEAD_PALETTES, type BeadColor, type BeadPalette } from '@/lib/beadPalettes'
import { MARD_STOCK_SERIES } from '@/lib/mardStockSeries'
import { cn } from '@/lib/utils'

type ColorReplacementPickerProps = {
  open: boolean
  palette: BeadPalette
  replacingCode: string
  replacingHex: string
  title?: string
  hint?: string
  allowRemove?: boolean
  onClose: () => void
  onPick: (code: string) => void
  onRemove?: () => void
}

function seriesIdFromCode(code: string): string {
  const m = code.match(/^([A-Z]+)/i)
  return m?.[1]?.toUpperCase() ?? '#'
}

type PickerColor = BeadColor & { brandId?: string }

function displayCodeForBrand(color: PickerColor, brand: BeadPalette): string {
  const prefix = `${brand.label} `
  return color.code.startsWith(prefix) ? color.code.slice(prefix.length) : color.code
}

function brandForColor(color: PickerColor): BeadPalette | null {
  if (color.brandId) {
    return BEAD_PALETTES.find((palette) => palette.id === color.brandId) ?? null
  }
  return BEAD_PALETTES.find((palette) => color.code.startsWith(`${palette.label} `)) ?? null
}

function isTransparentColor(color: PickerColor): boolean {
  const code = color.code.trim()
  return code === 'H1' || code === 'MH1' || code.endsWith(' H1') || code.endsWith(' MH1')
}

function groupBrandColors(brand: BeadPalette, colors: PickerColor[]) {
  const sorted = [...colors].sort((a, b) =>
    displayCodeForBrand(a, brand).localeCompare(displayCodeForBrand(b, brand), undefined, {
      numeric: true,
    }),
  )

  if (brand.id === 'mard') {
    return MARD_STOCK_SERIES.map((series) => ({
      id: series.id,
      colors: sorted.filter((color) => seriesIdFromCode(displayCodeForBrand(color, brand)) === series.id),
    })).filter((series) => series.colors.length > 0)
  }

  const groups = new Map<string, PickerColor[]>()
  for (const color of sorted) {
    const id = seriesIdFromCode(displayCodeForBrand(color, brand))
    groups.set(id, [...(groups.get(id) ?? []), color])
  }

  return [...groups.entries()].map(([id, groupColors]) => ({
    id,
    colors: groupColors,
  }))
}

export function ColorReplacementPicker({
  open,
  palette,
  replacingCode,
  replacingHex,
  title,
  hint,
  allowRemove = false,
  onClose,
  onPick,
  onRemove,
}: ColorReplacementPickerProps) {
  const t = useTranslations('pattern')
  const tMardSeries = useTranslations('colors.series')
  const isMard = palette.id === 'mard'
  const isMixed = palette.id === 'mixed'

  const seriesTabs = useMemo(() => {
    if (!isMard) return null
    return MARD_STOCK_SERIES.map((s) => s.id)
  }, [isMard])

  const [activeSeries, setActiveSeries] = useState(seriesTabs?.[0] ?? 'A')
  const [query, setQuery] = useState('')

  const filteredColors = useMemo(() => {
    let colors: readonly BeadColor[] = palette.colors
    if (isMard && seriesTabs) {
      colors = colors.filter((c) => seriesIdFromCode(c.code) === activeSeries)
    }
    const q = query.trim().toLowerCase()
    if (!q) return colors
    return colors.filter((c) => c.code.toLowerCase().includes(q))
  }, [palette.colors, isMard, seriesTabs, activeSeries, query])

  const mixedGroups = useMemo(() => {
    if (!isMixed) return null
    const colors = filteredColors as PickerColor[]
    const grouped = new Map<string, { brand: BeadPalette; colors: PickerColor[] }>()

    for (const color of colors) {
      const brand = brandForColor(color)
      if (!brand) continue
      const current = grouped.get(brand.id) ?? { brand, colors: [] }
      current.colors.push(color)
      grouped.set(brand.id, current)
    }

    return [...grouped.values()].map(({ brand, colors: brandColors }) => ({
      brand,
      series: groupBrandColors(brand, brandColors),
    }))
  }, [filteredColors, isMixed])

  function seriesLabel(brand: BeadPalette, seriesId: string): string {
    if (brand.id !== 'mard') return seriesId
    try {
      return tMardSeries(seriesId as never)
    } catch {
      return seriesId
    }
  }

  function renderColorButton(color: PickerColor, label = color.code) {
    const isTransparent = isTransparentColor(color)

    return (
      <li key={color.code}>
        <button
          type="button"
          onClick={() => {
            onPick(color.code)
            onClose()
          }}
          className={cn(
            'flex w-full flex-col items-center gap-1 rounded-lg border p-1 transition-colors hover:border-[var(--accent)]',
            color.code === replacingCode && 'ring-2 ring-[var(--accent)]',
          )}
          title={isTransparent ? `${color.code} (${t('transparentBeadLabel')})` : color.code}
        >
          <span
            className={cn(
              'relative h-10 w-full overflow-hidden rounded-t-lg rounded-b-sm border border-black/10',
              isTransparent && 'bg-[linear-gradient(45deg,#d7d0db_25%,transparent_25%,transparent_75%,#d7d0db_75%,#d7d0db),linear-gradient(45deg,#d7d0db_25%,transparent_25%,transparent_75%,#d7d0db_75%,#d7d0db)] bg-[length:12px_12px] bg-[position:0_0,6px_6px]',
            )}
            style={isTransparent ? undefined : { backgroundColor: color.hex }}
          >
            {isTransparent && (
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-[#34205f]">
                Clear
              </span>
            )}
          </span>
          <span className="max-w-full truncate font-mono text-[10px] font-semibold">
            {label}
          </span>
          {isTransparent && (
            <span className="-mt-1 max-w-full truncate text-[9px] text-[var(--muted)]">
              {t('transparentBeadLabel')}
            </span>
          )}
        </button>
      </li>
    )
  }

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal
      aria-labelledby="replace-dialog-title"
      onClick={onClose}
    >
      <div
        className="flex max-h-[min(640px,90vh)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-black/10 px-5 py-4">
          <div>
            <h2 id="replace-dialog-title" className="text-lg font-semibold text-[#34205f]">
              {title ?? t('replaceDialogTitle')}
            </h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{hint ?? t('replaceDialogHint')}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-black/[0.04] px-2 py-1 text-xs font-medium">
              {t('replacingLabel')}{' '}
              <span className="font-mono">{replacingCode}</span>
            </span>
            <span
              className="size-6 rounded border border-black/10"
              style={{ backgroundColor: replacingHex }}
            />
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1 hover:bg-black/[0.06]"
              aria-label={t('replaceCancel')}
            >
              <X className="size-5" />
            </button>
          </div>
        </header>

        {isMard && seriesTabs && (
          <div className="flex flex-wrap gap-1.5 border-b border-black/10 px-5 py-3">
            {seriesTabs.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveSeries(id)}
                className={cn(
                  'size-9 rounded-full border font-mono text-sm font-semibold transition-colors',
                  activeSeries === id
                    ? 'border-[#34205f] bg-[#34205f] text-white'
                    : 'border-black/15 bg-white text-[var(--foreground)] hover:bg-black/[0.04]',
                )}
              >
                {id}
              </button>
            ))}
          </div>
        )}

        <div className="border-b border-black/10 px-5 py-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('stockSearch')}
            className="w-full rounded-md border border-black/15 px-3 py-2 font-mono text-sm"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {allowRemove && onRemove && (
            <div className="mb-4">
              <button
                type="button"
                onClick={() => {
                  onRemove()
                  onClose()
                }}
                className="flex w-full items-center gap-3 rounded-xl border border-dashed border-black/20 p-3 text-left transition-colors hover:border-[var(--accent)] hover:bg-black/[0.02]"
              >
                <span className="relative h-10 w-14 shrink-0 overflow-hidden rounded-lg border border-black/10 bg-[linear-gradient(45deg,#d7d0db_25%,transparent_25%,transparent_75%,#d7d0db_75%,#d7d0db),linear-gradient(45deg,#d7d0db_25%,transparent_25%,transparent_75%,#d7d0db_75%,#d7d0db)] bg-[length:12px_12px] bg-[position:0_0,6px_6px]" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-sm font-semibold text-[#34205f]">{t('replaceRemoveOption')}</span>
                  <span className="text-xs text-[var(--muted)]">{t('replaceRemoveHint')}</span>
                </span>
              </button>
            </div>
          )}
          {mixedGroups ? (
            <div className="flex flex-col gap-5">
              {mixedGroups.map(({ brand, series }) => (
                <section key={brand.id} className="flex flex-col gap-3">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
                    {brand.label}
                  </h3>
                  {series.map((group) => (
                    <section key={`${brand.id}-${group.id}`}>
                      <h4 className="mb-1.5 flex items-baseline gap-2 text-xs font-medium">
                        <span className="font-mono">{group.id}</span>
                        <span className="text-[var(--muted)]">{seriesLabel(brand, group.id)}</span>
                      </h4>
                      <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-2">
                        {group.colors.map((color) =>
                          renderColorButton(color, displayCodeForBrand(color, brand)),
                        )}
                      </ul>
                    </section>
                  ))}
                </section>
              ))}
            </div>
          ) : (
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-2">
              {filteredColors.map((color) => renderColorButton(color))}
            </ul>
          )}
        </div>

        <footer className="border-t border-black/10 px-5 py-2 text-xs text-[var(--muted)]">
          {t('replaceDialogFooter', { count: filteredColors.length })}
        </footer>
      </div>
    </div>
  )
}
