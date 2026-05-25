'use client'

import { X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { BeadColor, BeadPalette } from '@/lib/beadPalettes'
import { MARD_STOCK_SERIES } from '@/lib/mardStockSeries'
import { cn } from '@/lib/utils'

type ColorReplacementPickerProps = {
  open: boolean
  palette: BeadPalette
  replacingCode: string
  replacingHex: string
  title?: string
  hint?: string
  onClose: () => void
  onPick: (code: string) => void
}

function seriesIdFromCode(code: string): string {
  const m = code.match(/^([A-Z]+)/i)
  return m?.[1]?.toUpperCase() ?? '#'
}

export function ColorReplacementPicker({
  open,
  palette,
  replacingCode,
  replacingHex,
  title,
  hint,
  onClose,
  onPick,
}: ColorReplacementPickerProps) {
  const t = useTranslations('pattern')
  const isMard = palette.id === 'mard'

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
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.25rem,1fr))] gap-2">
            {filteredColors.map((color) => (
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
                  title={color.code}
                >
                  <span
                    className="h-10 w-full rounded-t-lg rounded-b-sm border border-black/10"
                    style={{ backgroundColor: color.hex }}
                  />
                  <span className="max-w-full truncate font-mono text-[10px] font-semibold">
                    {color.code}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>

        <footer className="border-t border-black/10 px-5 py-2 text-xs text-[var(--muted)]">
          {t('replaceDialogFooter', { count: filteredColors.length })}
        </footer>
      </div>
    </div>
  )
}
