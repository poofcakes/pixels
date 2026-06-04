'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import { BeadInventoryPicker } from '@/components/BeadInventoryPicker'
import { ColorChip } from '@/components/ColorChip'
import {
  BEAD_PALETTES,
  getBeadPalette,
  type BeadColor,
  type BeadPaletteId,
} from '@/lib/beadPalettes'
import { loadEnabledStock, saveEnabledStock } from '@/lib/beadStockStorage'
import { MARD_COLOR_SERIES } from '@/lib/mardColors'

const BRAND_PALETTES = BEAD_PALETTES.filter((palette) => palette.id !== 'mixed')
const MARD_221_BASE_SERIES = new Set(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'M'])
const MARD_EXTENDED_264_SERIES_COUNTS = [
  ['P', 'P1-P23'],
  ['Q', 'Q2 and Q5 only'],
  ['R', 'R1-R13'],
  ['T', 'T1'],
  ['Y', 'Y1-Y5'],
] as const

type ColorChartPageProps = {
  paletteId?: BeadPaletteId | null
}

type ColorViewMode = 'chart' | 'map' | 'family'

type HslColor = {
  h: number
  s: number
  l: number
}

const LIGHTNESS_BANDS = [
  { id: 'pale', min: 0.82 },
  { id: 'light', min: 0.65 },
  { id: 'mid', min: 0.45 },
  { id: 'deep', min: 0.25 },
  { id: 'dark', min: 0 },
] as const

const COLOR_FAMILIES = [
  { id: 'red', min: 345, max: 360 },
  { id: 'red', min: 0, max: 15 },
  { id: 'orange', min: 15, max: 45 },
  { id: 'yellow', min: 45, max: 75 },
  { id: 'green', min: 75, max: 165 },
  { id: 'cyan', min: 165, max: 200 },
  { id: 'blue', min: 200, max: 255 },
  { id: 'purple', min: 255, max: 295 },
  { id: 'pink', min: 295, max: 345 },
] as const

const COLOR_FAMILY_ORDER = ['red', 'orange', 'yellow', 'green', 'cyan', 'blue', 'purple', 'pink', 'neutral'] as const

function colorChartPath(id: BeadPaletteId): string {
  return `/colors/${id}/`
}

function colorDetailPath(paletteId: BeadPaletteId, code: string): string {
  return `/colors/${paletteId}/${encodeURIComponent(code)}/`
}

function sourceLabelForPalette(id: BeadPaletteId): string {
  if (id === 'artkalC') return 'Artkal C Mini RGB colour chart PDF (2024)'
  if (id === 'artkalM') return 'Artkal M Mini RGB colour chart PDF (2025)'
  if (id === 'zllbtmo') return 'Amazon product photo reference'
  return 'pixel-beads.com'
}

function groupPaletteColorsByPrefix(palette: ReturnType<typeof getBeadPalette>) {
  const groups = new Map<string, typeof palette.colors>()
  for (const color of palette.colors) {
    const id = /^([A-Z]+)/i.exec(color.code)?.[1]?.toUpperCase() ?? '#'
    const list = groups.get(id) ?? []
    groups.set(id, [...list, color])
  }
  return [...groups.entries()]
}

function hexToHsl(hex: string): HslColor {
  const value = hex.replace('#', '')
  const r = parseInt(value.slice(0, 2), 16) / 255
  const g = parseInt(value.slice(2, 4), 16) / 255
  const b = parseInt(value.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number

  switch (max) {
    case r:
      h = (g - b) / d + (g < b ? 6 : 0)
      break
    case g:
      h = (b - r) / d + 2
      break
    default:
      h = (r - g) / d + 4
      break
  }

  return { h: h * 60, s, l }
}

function hueSortValue(color: BeadColor): number {
  const hsl = hexToHsl(color.hex)
  return hsl.s < 0.08 ? 361 + hsl.l : hsl.h
}

function colorMapBands(colors: readonly BeadColor[]) {
  return LIGHTNESS_BANDS.map((band) => ({
    id: band.id,
    colors: colors
      .filter((color) => hexToHsl(color.hex).l >= band.min)
      .filter((color) => {
        const nextBand = LIGHTNESS_BANDS[LIGHTNESS_BANDS.findIndex((b) => b.id === band.id) - 1]
        return !nextBand || hexToHsl(color.hex).l < nextBand.min
      })
      .sort((a, b) => hueSortValue(a) - hueSortValue(b) || a.code.localeCompare(b.code, undefined, { numeric: true })),
  })).filter((band) => band.colors.length > 0)
}

function colorFamilyForHex(hex: string): (typeof COLOR_FAMILY_ORDER)[number] {
  const hsl = hexToHsl(hex)
  if (hsl.s < 0.12) return 'neutral'
  return COLOR_FAMILIES.find((family) => hsl.h >= family.min && hsl.h < family.max)?.id ?? 'neutral'
}

function colorFamilyBands(colors: readonly BeadColor[]) {
  return COLOR_FAMILY_ORDER.map((family) => ({
    id: family,
    colors: colors
      .filter((color) => colorFamilyForHex(color.hex) === family)
      .sort((a, b) => {
        const aHsl = hexToHsl(a.hex)
        const bHsl = hexToHsl(b.hex)
        return bHsl.l - aHsl.l || aHsl.h - bHsl.h || a.code.localeCompare(b.code, undefined, { numeric: true })
      }),
  })).filter((band) => band.colors.length > 0)
}

function ColorChipGrid({
  colors,
  paletteId,
}: {
  colors: readonly BeadColor[]
  paletteId: BeadPaletteId
}) {
  const t = useTranslations('colors')

  return (
    <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11">
      {colors.map((c) => (
        <ColorChip
          key={c.code}
          code={c.code}
          hex={c.hex}
          name={c.name}
          href={colorDetailPath(paletteId, c.code)}
          copyLabel={t('copy')}
          copiedLabel={t('copied')}
        />
      ))}
    </div>
  )
}

function PaletteInventoryEditor({ paletteId }: { paletteId: Exclude<BeadPaletteId, 'mixed'> }) {
  const t = useTranslations('colors')
  const palette = getBeadPalette(paletteId)
  const allCodes = useMemo(() => palette.colors.map((color) => color.code), [palette.colors])
  const [enabled, setEnabled] = useState<Set<string>>(() => loadEnabledStock(paletteId, allCodes))

  useEffect(() => {
    setEnabled(loadEnabledStock(paletteId, allCodes))
  }, [paletteId, allCodes])

  function handleEnabledChange(next: Set<string>): void {
    setEnabled(next)
    saveEnabledStock(paletteId, next)
  }

  return (
    <section className="mt-8 rounded-2xl border border-black/10 bg-white/85 p-4 shadow-sm">
      <div className="mb-3 flex flex-col gap-1">
        <h2 className="text-lg font-semibold tracking-tight">
          {t('stockEditorTitle', { palette: palette.label })}
        </h2>
        <p className="text-sm text-[var(--muted)]">{t('stockEditorHint')}</p>
      </div>
      <BeadInventoryPicker
        paletteId={paletteId}
        enabled={enabled}
        onEnabledChange={handleEnabledChange}
        title={t('stockEditorPickerTitle', { palette: palette.label })}
      />
      <p className="mt-3 text-xs text-[var(--muted)]">{t('stockEditorSaved')}</p>
    </section>
  )
}

export function ColorChartPage({ paletteId }: ColorChartPageProps = {}) {
  const t = useTranslations('colors')
  const tSeries = useTranslations('colors.series')
  const [viewMode, setViewMode] = useState<ColorViewMode>('chart')

  if (!paletteId || paletteId === 'mixed') {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
        <header className="flex flex-col gap-3">
          <a href="/" className="text-sm font-medium text-[var(--accent)] hover:underline">
            {t('backToPattern')}
          </a>
          <p className="text-sm font-medium uppercase tracking-wide text-[var(--accent)]">
            {t('indexEyebrow')}
          </p>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{t('indexTitle')}</h1>
          <p className="max-w-2xl text-[var(--muted)]">{t('indexSubtitle')}</p>
          <p className="max-w-2xl text-sm text-[var(--muted)]">{t('sourceAll')}</p>
        </header>

        <section className="mt-8">
          <a
            href="/mard-artkal-comparison/"
            className="group block rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 p-5 shadow-sm transition-colors hover:border-[var(--accent)]/50 hover:bg-[var(--accent)]/15"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                  Comparison tool
                </p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-[#34205f]">
                  MARD and Artkal-M side by side
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
                  Compare matching codes like A1 and MA1, then jump into individual colour pages.
                </p>
              </div>
              <span className="w-fit rounded-full bg-white px-3 py-1.5 text-sm font-medium text-[var(--accent)] shadow-sm group-hover:underline">
                Open comparison
              </span>
            </div>
          </a>
        </section>

        <section className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {BRAND_PALETTES.map((palette) => (
            <a
              key={palette.id}
              href={colorChartPath(palette.id)}
              className="group rounded-2xl border border-black/10 bg-white/80 p-5 shadow-sm transition-colors hover:border-[var(--accent)] hover:bg-white"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">{palette.label}</h2>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    {t('paletteCardCount', { count: palette.colors.length })}
                  </p>
                </div>
                <span className="rounded-full bg-[var(--accent)]/10 px-3 py-1 text-xs font-medium text-[var(--accent)]">
                  {t('viewChart')}
                </span>
              </div>
              <div className="mt-5 grid grid-cols-8 gap-1">
                {palette.colors.slice(0, 24).map((color) => (
                  <span
                    key={color.code}
                    className="aspect-square rounded border border-black/10"
                    style={{ backgroundColor: color.hex }}
                    title={`${color.code} ${color.hex}`}
                  />
                ))}
              </div>
              <p className="mt-4 text-xs text-[var(--muted)]">
                {t('sourcePrefix')}{' '}
                <span className="text-[var(--accent)] group-hover:underline">
                  {sourceLabelForPalette(palette.id)}
                </span>
              </p>
            </a>
          ))}
        </section>
      </main>
    )
  }

  const palette = getBeadPalette(paletteId)
  const isMard = paletteId === 'mard'
  const isArtkalMini = paletteId === 'artkalC' || paletteId === 'artkalM'
  const isGroupedArtkal = isArtkalMini
  const groupedPaletteColors = isGroupedArtkal ? groupPaletteColorsByPrefix(palette) : null
  const mapBands = useMemo(() => colorMapBands(palette.colors), [palette.colors])
  const familyBands = useMemo(() => colorFamilyBands(palette.colors), [palette.colors])

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <header className="flex flex-col gap-3">
        <a href="/" className="text-sm font-medium text-[var(--accent)] hover:underline">
          {t('backToPattern')}
        </a>
        <a href="/colors/" className="text-sm font-medium text-[var(--accent)] hover:underline">
          {t('backToColors')}
        </a>
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--accent)]">
          {t('countLabel', { count: palette.colors.length })}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          {t('chartTitle', { palette: palette.label })}
        </h1>
        <p className="max-w-2xl text-[var(--muted)]">
          {t('chartSubtitle', { palette: palette.label, count: palette.colors.length })}
        </p>
        {palette.sourceUrl && (
          <p className="max-w-2xl text-sm text-[var(--muted)]">
            {t('sourcePrefix')}{' '}
            <a
              href={palette.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              {sourceLabelForPalette(palette.id)}
            </a>
            .
          </p>
        )}
        <div className="mt-3 flex w-fit flex-wrap gap-1 rounded-full border border-black/10 bg-white/70 p-1 text-sm shadow-sm">
          {([
            ['chart', t('viewChartOrder')],
            ['map', t('viewColorMap')],
            ['family', t('viewColorFamilies')],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              className={[
                'rounded-full px-3 py-1.5 font-medium transition-colors',
                viewMode === mode
                  ? 'bg-[var(--accent)] text-white'
                  : 'text-[var(--muted)] hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      {isArtkalMini && (
        <aside className="mt-8 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 p-4 text-sm">
          <h2 className="font-semibold text-[#34205f]">{t('artkalMiniInfoTitle')}</h2>
          <p className="mt-2 max-w-3xl text-[var(--foreground)]">{t('artkalMiniInfoBody')}</p>
          <p className="mt-2 max-w-3xl text-[var(--foreground)]">
            {paletteId === 'artkalC' ? t('artkalMiniCChartNote') : t('artkalMiniMChartNote')}
          </p>
          <p className="mt-2 max-w-3xl text-xs text-[var(--muted)]">{t('artkalMiniInfoOtherLine')}</p>
          <p className="mt-2 max-w-3xl text-xs text-[var(--muted)]">
            {t('sourcePrefix')}{' '}
            <a
              href="https://www.artkalfusebeads.com/blogs/faq/what-is-different-with-a-2-6mm-and-c-2-6mm"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--accent)] hover:underline"
            >
              {t('artkalCInfoSource')}
            </a>
            .
          </p>
        </aside>
      )}

      <PaletteInventoryEditor paletteId={paletteId as Exclude<BeadPaletteId, 'mixed'>} />

      <div className="mt-12 flex flex-col gap-14">
        {viewMode === 'family' ? (
          <section aria-labelledby={`palette-${palette.id}-color-families`}>
            <div className="flex items-baseline justify-between gap-4 border-b border-black/10 pb-2">
              <h2 id={`palette-${palette.id}-color-families`} className="text-xl font-semibold tracking-tight">
                {t('colorFamiliesTitle')}
              </h2>
              <span className="font-mono text-xs text-[var(--muted)]">
                {t('colorFamiliesHint')}
              </span>
            </div>
            <div className="mt-6 flex flex-col gap-8">
              {familyBands.map((band) => (
                <section key={band.id}>
                  <div className="flex items-baseline gap-3 border-b border-black/10 pb-1">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
                      {t(`colorFamily.${band.id}`)}
                    </h3>
                    <span className="font-mono text-xs text-[var(--muted)]">
                      {t('countLabel', { count: band.colors.length })}
                    </span>
                  </div>
                  <ColorChipGrid colors={band.colors} paletteId={palette.id} />
                </section>
              ))}
            </div>
          </section>
        ) : viewMode === 'map' ? (
          <section aria-labelledby={`palette-${palette.id}-color-map`}>
            <div className="flex items-baseline justify-between gap-4 border-b border-black/10 pb-2">
              <h2 id={`palette-${palette.id}-color-map`} className="text-xl font-semibold tracking-tight">
                {t('colorMapTitle')}
              </h2>
              <span className="font-mono text-xs text-[var(--muted)]">
                {t('colorMapHint')}
              </span>
            </div>
            <div className="mt-6 flex flex-col gap-8">
              {mapBands.map((band) => (
                <section key={band.id}>
                  <div className="flex items-baseline gap-3 border-b border-black/10 pb-1">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
                      {t(`lightnessBand.${band.id}`)}
                    </h3>
                    <span className="font-mono text-xs text-[var(--muted)]">
                      {t('countLabel', { count: band.colors.length })}
                    </span>
                  </div>
                  <ColorChipGrid colors={band.colors} paletteId={palette.id} />
                </section>
              ))}
            </div>
          </section>
        ) : isMard ? MARD_COLOR_SERIES.map((series) => {
          let label: string
          try {
            label = tSeries(series.id as never)
          } catch {
            label = series.label
          }

          return (
            <section key={series.id} aria-labelledby={`series-${series.id}`}>
              {series.id === 'P' && (
                <aside className="mb-8 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 p-4 text-sm">
                  <h2 className="font-semibold text-[#34205f]">{t('mardSetNoteTitle')}</h2>
                  <p className="mt-2 max-w-3xl text-[var(--foreground)]">
                    {t('mard221CutoffNote')}
                  </p>
                  <p className="mt-2 max-w-3xl text-[var(--foreground)]">
                    {t('mard264Note')}
                  </p>
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {MARD_EXTENDED_264_SERIES_COUNTS.map(([seriesId, range]) => (
                      <li
                        key={seriesId}
                        className="rounded-full border border-black/10 bg-white/70 px-3 py-1 font-mono text-xs"
                      >
                        {seriesId}: {range}
                      </li>
                    ))}
                  </ul>
                </aside>
              )}
              <div className="flex items-baseline justify-between gap-4 border-b border-black/10 pb-2">
                <h2 id={`series-${series.id}`} className="text-xl font-semibold tracking-tight">
                  <span className="font-mono text-[var(--muted)]">{series.id}</span> · {label}
                </h2>
                <span className="font-mono text-xs text-[var(--muted)]">
                  {t('countLabel', { count: series.colors.length })}
                  {MARD_221_BASE_SERIES.has(series.id) ? ` · ${t('mard221Base')}` : ''}
                </span>
              </div>

              <ColorChipGrid colors={series.colors} paletteId={palette.id} />
            </section>
          )
        }) : groupedPaletteColors ? (
          groupedPaletteColors.map(([seriesId, colors]) => (
            <section key={seriesId} aria-labelledby={`series-${seriesId}`}>
              <div className="flex items-baseline justify-between gap-4 border-b border-black/10 pb-2">
                <h2 id={`series-${seriesId}`} className="text-xl font-semibold tracking-tight">
                  <span className="font-mono text-[var(--muted)]">{seriesId}</span> ·{' '}
                  {t('artkalMSeriesLabel', { series: seriesId })}
                </h2>
                <span className="font-mono text-xs text-[var(--muted)]">
                  {t('countLabel', { count: colors.length })}
                </span>
              </div>

              <ColorChipGrid colors={colors} paletteId={palette.id} />
            </section>
          ))
        ) : (
          <section aria-labelledby={`palette-${palette.id}`}>
            <div className="flex items-baseline justify-between gap-4 border-b border-black/10 pb-2">
              <h2 id={`palette-${palette.id}`} className="text-xl font-semibold tracking-tight">
                {palette.label}
              </h2>
              <span className="font-mono text-xs text-[var(--muted)]">
                {t('countLabel', { count: palette.colors.length })}
              </span>
            </div>

            <ColorChipGrid colors={palette.colors} paletteId={palette.id} />
          </section>
        )}
      </div>

      <footer className="mt-16 border-t border-black/10 pt-6 text-xs text-[var(--muted)]">
        <p>{t('disclaimer')}</p>
        <p className="mt-1">
          {t('sourceSpecific', {
            palette: palette.label,
            source: sourceLabelForPalette(palette.id),
          })}
        </p>
      </footer>
    </main>
  )
}
