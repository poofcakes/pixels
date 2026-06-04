'use client'

import { useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'

import {
  BEAD_PALETTES,
  getBeadPalette,
  type BeadColor,
  type BeadPaletteId,
} from '@/lib/beadPalettes'
import { deltaE76, hexToRgb, rgbToLab } from '@/lib/beadColorMatch'

type MatchQuality = 'excellent' | 'close' | 'usable' | 'weak'

type PaletteMatch = {
  source: BeadColor
  target: BeadColor
  distance: number
  quality: MatchQuality
}

const BRAND_PALETTES = BEAD_PALETTES.filter((palette) => palette.id !== 'mixed')
const MATCH_FILTERS: readonly (MatchQuality | 'all')[] = ['all', 'excellent', 'close', 'usable', 'weak']

function matchQuality(distance: number): MatchQuality {
  if (distance < 3) return 'excellent'
  if (distance < 6) return 'close'
  if (distance < 10) return 'usable'
  return 'weak'
}

function matchQualityClasses(quality: MatchQuality): string {
  switch (quality) {
    case 'excellent':
      return 'bg-emerald-100 text-emerald-800'
    case 'close':
      return 'bg-blue-100 text-blue-800'
    case 'usable':
      return 'bg-amber-100 text-amber-800'
    case 'weak':
      return 'bg-rose-100 text-rose-800'
  }
}

function comparePalettes(
  sourcePalette: ReturnType<typeof getBeadPalette>,
  targetPalette: ReturnType<typeof getBeadPalette>,
): PaletteMatch[] {
  const targetColors = targetPalette.colors.map((color) => {
    const rgb = hexToRgb(color.hex)
    return { color, lab: rgbToLab(...rgb) }
  })

  return sourcePalette.colors.map((source) => {
    const sourceLab = rgbToLab(...hexToRgb(source.hex))
    let best = targetColors[0]
    let bestDistance = Infinity

    for (const target of targetColors) {
      const distance = deltaE76(sourceLab, target.lab)
      if (distance < bestDistance) {
        best = target
        bestDistance = distance
      }
    }

    return {
      source,
      target: best.color,
      distance: bestDistance,
      quality: matchQuality(bestDistance),
    }
  })
}

function MatchSwatch({ color }: { color: BeadColor }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="h-10 w-10 shrink-0 rounded-xl border border-black/10 shadow-inner"
        style={{ backgroundColor: color.hex }}
        title={`${color.code} ${color.hex}`}
      />
      <span>
        <span className="block font-mono text-sm font-semibold">{color.code}</span>
        {color.name && !color.name.startsWith('Photo sample') && (
          <span className="block text-xs text-[var(--muted)]">{color.name}</span>
        )}
        <span className="block font-mono text-xs text-[var(--muted)]">{color.hex}</span>
      </span>
    </div>
  )
}

export function ColorMatcherPage() {
  const t = useTranslations('colors')
  const [matchSourceId, setMatchSourceId] = useState<BeadPaletteId>('mard')
  const [matchTargetId, setMatchTargetId] = useState<BeadPaletteId>('artkalC')
  const [matchFilter, setMatchFilter] = useState<MatchQuality | 'all'>('all')
  const [matchQuery, setMatchQuery] = useState('')

  const matchSourcePalette = getBeadPalette(matchSourceId)
  const matchTargetPalette = getBeadPalette(matchTargetId)
  const matches = useMemo(
    () => comparePalettes(matchSourcePalette, matchTargetPalette),
    [matchSourcePalette, matchTargetPalette],
  )
  const query = matchQuery.trim().toLowerCase()
  const filteredMatches = matches.filter((match) => {
    const matchesFilter = matchFilter === 'all' || match.quality === matchFilter
    const matchesQuery =
      query.length === 0 ||
      `${match.source.code} ${match.source.hex} ${match.target.code} ${match.target.hex}`.toLowerCase().includes(query)

    return matchesFilter && matchesQuery
  })
  const qualityCounts = matches.reduce<Record<MatchQuality, number>>(
    (counts, match) => ({
      ...counts,
      [match.quality]: counts[match.quality] + 1,
    }),
    { excellent: 0, close: 0, usable: 0, weak: 0 },
  )

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <header className="flex flex-col gap-3">
        <a href="/" className="text-sm font-medium text-[var(--accent)] hover:underline">
          {t('backToPattern')}
        </a>
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--accent)]">
          {t('matchFinderEyebrow')}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{t('matchFinderTitle')}</h1>
        <p className="max-w-3xl text-[var(--muted)]">{t('matchFinderHint')}</p>
      </header>

      <section className="mt-10 rounded-3xl border border-black/10 bg-white/85 p-5 shadow-sm sm:p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            {t('matchSourceLabel')}
            <select
              value={matchSourceId}
              onChange={(event) => setMatchSourceId(event.target.value as BeadPaletteId)}
              className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              {BRAND_PALETTES.map((palette) => (
                <option key={palette.id} value={palette.id}>
                  {palette.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            {t('matchTargetLabel')}
            <select
              value={matchTargetId}
              onChange={(event) => setMatchTargetId(event.target.value as BeadPaletteId)}
              className="mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm"
            >
              {BRAND_PALETTES.map((palette) => (
                <option key={palette.id} value={palette.id}>
                  {palette.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-5 grid gap-3 rounded-2xl bg-[var(--accent)]/5 p-4 text-sm sm:grid-cols-4">
          {(['excellent', 'close', 'usable', 'weak'] as const).map((quality) => (
            <div key={quality}>
              <span className="block text-2xl font-semibold">{qualityCounts[quality]}</span>
              <span className="text-[var(--muted)]">{t(`matchQuality.${quality}`)}</span>
            </div>
          ))}
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {MATCH_FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                onClick={() => setMatchFilter(filter)}
                className={[
                  'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
                  matchFilter === filter
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-white text-[var(--muted)] hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]',
                ].join(' ')}
              >
                {filter === 'all' ? t('matchFilterAll') : t(`matchQuality.${filter}`)}
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor="match-search">
            {t('matchSearch')}
          </label>
          <input
            id="match-search"
            type="search"
            value={matchQuery}
            onChange={(event) => setMatchQuery(event.target.value)}
            placeholder={t('matchSearch')}
            className="w-full rounded-full border border-black/10 bg-white px-4 py-2 text-sm lg:max-w-xs"
          />
        </div>

        <div className="mt-5 max-h-[42rem] overflow-auto rounded-2xl border border-black/10 bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 bg-white text-left text-xs uppercase tracking-wide text-[var(--muted)]">
              <tr>
                <th className="border-b border-black/10 px-4 py-3">{matchSourcePalette.label}</th>
                <th className="border-b border-black/10 px-4 py-3">{matchTargetPalette.label}</th>
                <th className="border-b border-black/10 px-4 py-3">{t('matchDistance')}</th>
                <th className="border-b border-black/10 px-4 py-3">{t('matchQualityLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {filteredMatches.map((match) => (
                <tr key={match.source.code} className="border-b border-black/5 last:border-0">
                  <td className="px-4 py-3">
                    <MatchSwatch color={match.source} />
                  </td>
                  <td className="px-4 py-3">
                    <MatchSwatch color={match.target} />
                  </td>
                  <td className="px-4 py-3 font-mono">{match.distance.toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${matchQualityClasses(match.quality)}`}>
                      {t(`matchQuality.${match.quality}`)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-[var(--muted)]">
          {t('matchFinderDisclaimer', { count: filteredMatches.length, total: matches.length })}
        </p>
      </section>
    </main>
  )
}
