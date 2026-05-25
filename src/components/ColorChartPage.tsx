'use client'

import { useTranslations } from 'next-intl'

import { ColorChip } from '@/components/ColorChip'
import {
  BEAD_PALETTES,
  getBeadPalette,
  type BeadPaletteId,
} from '@/lib/beadPalettes'
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

function colorChartPath(id: BeadPaletteId): string {
  return `/colors/${id}/`
}

function sourceLabelForPalette(id: BeadPaletteId): string {
  if (id === 'artkalC') return 'Artkal C Mini RGB colour chart PDF (2024)'
  if (id === 'artkalM') return 'Artkal M Mini RGB colour chart PDF (2025)'
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

export function ColorChartPage({ paletteId }: ColorChartPageProps = {}) {
  const t = useTranslations('colors')
  const tSeries = useTranslations('colors.series')

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
  const isArtkalC = paletteId === 'artkalC'
  const isGroupedArtkal = paletteId === 'artkalC' || paletteId === 'artkalM'
  const groupedPaletteColors = isGroupedArtkal ? groupPaletteColorsByPrefix(palette) : null

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
      </header>

      {isArtkalC && (
        <aside className="mt-8 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/10 p-4 text-sm">
          <h2 className="font-semibold text-[#34205f]">{t('artkalCInfoTitle')}</h2>
          <p className="mt-2 max-w-3xl text-[var(--foreground)]">{t('artkalCInfoC')}</p>
          <p className="mt-2 max-w-3xl text-[var(--foreground)]">{t('artkalCInfoA')}</p>
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

      <div className="mt-12 flex flex-col gap-14">
        {isMard ? MARD_COLOR_SERIES.map((series) => {
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

              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11">
                {series.colors.map((c) => (
                  <ColorChip
                    key={c.code}
                    code={c.code}
                    hex={c.hex}
                    copyLabel={t('copy')}
                    copiedLabel={t('copied')}
                  />
                ))}
              </div>
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

              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11">
                {colors.map((c) => (
                  <ColorChip
                    key={c.code}
                    code={c.code}
                    hex={c.hex}
                    copyLabel={t('copy')}
                    copiedLabel={t('copied')}
                  />
                ))}
              </div>
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

            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11">
              {palette.colors.map((c) => (
                <ColorChip
                  key={c.code}
                  code={c.code}
                  hex={c.hex}
                  copyLabel={t('copy')}
                  copiedLabel={t('copied')}
                />
              ))}
            </div>
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
