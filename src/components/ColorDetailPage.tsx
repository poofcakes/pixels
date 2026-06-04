'use client'

import {
  BEAD_PALETTES,
  getBeadPalette,
  type BeadColor,
  type BeadPalette,
  type BeadPaletteId,
} from '@/lib/beadPalettes'
import { deltaE2000, hexToRgb, rgbToLab } from '@/lib/beadColorMatch'
import { isLightHex } from '@/lib/mardColors'
import { cn } from '@/lib/utils'

type ColorDetailPageProps = {
  paletteId: BeadPaletteId | null
  colorCode?: string | null
}

type CrossBrandMatch = {
  palette: BeadPalette
  color: BeadColor
  distance: number
}

const BRAND_PALETTES = BEAD_PALETTES.filter((palette) => palette.id !== 'mixed')

function colorDetailPath(paletteId: BeadPaletteId, code: string): string {
  return `/colors/${paletteId}/${encodeURIComponent(code)}/`
}

function beadSizeLabel(paletteId: BeadPaletteId): string {
  switch (paletteId) {
    case 'artkalC':
    case 'artkalM':
      return '2.6 mm mini'
    case 'mixed':
      return 'Mixed sizes'
    default:
      return '5 mm midi'
  }
}

function sourceLabelForPalette(id: BeadPaletteId): string {
  if (id === 'artkalC') return 'Artkal C Mini RGB colour chart PDF (2024)'
  if (id === 'artkalM') return 'Artkal M Mini RGB colour chart PDF (2025)'
  if (id === 'zllbtmo') return 'Amazon product photo reference'
  return 'pixel-beads.com'
}

function findColor(palette: BeadPalette, code: string): BeadColor | null {
  const normalized = code.trim().toLowerCase()
  return palette.colors.find((color) => color.code.toLowerCase() === normalized) ?? null
}

function rgbLabel(hex: string): string {
  return hexToRgb(hex).join(', ')
}

function matchLabel(distance: number): string {
  if (distance <= 1.5) return 'Nearly identical'
  if (distance <= 4) return 'Very close'
  if (distance <= 8) return 'Close'
  return 'Nearest shade'
}

function matchBadgeClass(distance: number): string {
  if (distance <= 1.5) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (distance <= 4) return 'border-lime-200 bg-lime-50 text-lime-800'
  if (distance <= 8) return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-black/10 bg-black/[0.03] text-[var(--muted)]'
}

function closestMatches(sourcePaletteId: BeadPaletteId, source: BeadColor): CrossBrandMatch[] {
  const sourceLab = rgbToLab(...hexToRgb(source.hex))

  return BRAND_PALETTES
    .filter((palette) => palette.id !== sourcePaletteId)
    .map((palette) => {
      let best = palette.colors[0]
      let bestDistance = Infinity

      for (const candidate of palette.colors) {
        const distance = deltaE2000(sourceLab, rgbToLab(...hexToRgb(candidate.hex)))
        if (distance < bestDistance) {
          best = candidate
          bestDistance = distance
        }
      }

      return {
        palette,
        color: best,
        distance: bestDistance,
      }
    })
    .sort((a, b) => a.distance - b.distance)
}

function ColorSwatch({
  color,
  className,
}: {
  color: BeadColor
  className?: string
}) {
  const light = isLightHex(color.hex)

  return (
    <div
      className={cn(
        'flex min-h-72 flex-col justify-between rounded-3xl border p-6 shadow-sm',
        light ? 'border-black/10 text-black/80' : 'border-white/15 text-white/90',
        className,
      )}
      style={{ backgroundColor: color.hex }}
    >
      <div>
        <p className="font-mono text-sm font-semibold uppercase tracking-wide opacity-80">{color.code}</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
          {color.name ?? color.code}
        </h1>
      </div>
      <p className="font-mono text-lg font-semibold">{color.hex}</p>
    </div>
  )
}

function MetadataCard({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white/85 p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-words font-mono text-lg font-semibold text-[#34205f]">{value}</p>
    </div>
  )
}

function MatchCard({ match }: { match: CrossBrandMatch }) {
  const light = isLightHex(match.color.hex)

  return (
    <a
      href={colorDetailPath(match.palette.id, match.color.code)}
      className="group grid gap-3 rounded-2xl border border-black/10 bg-white/85 p-3 shadow-sm transition-colors hover:border-[var(--accent)] hover:bg-white sm:grid-cols-[7rem_minmax(0,1fr)_auto]"
    >
      <div
        className={cn(
          'flex min-h-24 flex-col justify-between rounded-xl border p-3 font-mono text-xs',
          light ? 'border-black/10 text-black/80' : 'border-white/15 text-white/90',
        )}
        style={{ backgroundColor: match.color.hex }}
      >
        <span className="font-bold">{match.color.code}</span>
        <span>{match.color.hex}</span>
      </div>
      <div className="min-w-0 self-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
          {match.palette.label}
        </p>
        <h3 className="mt-1 truncate text-xl font-semibold text-[#34205f] group-hover:text-[var(--accent)]">
          {match.color.name ?? match.color.code}
        </h3>
        <p className="mt-1 font-mono text-sm text-[var(--muted)]">RGB {rgbLabel(match.color.hex)}</p>
      </div>
      <div className="flex items-center sm:justify-end">
        <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', matchBadgeClass(match.distance))}>
          Delta {match.distance.toFixed(1)} | {matchLabel(match.distance)}
        </span>
      </div>
    </a>
  )
}

export function ColorDetailPage({ paletteId, colorCode }: ColorDetailPageProps) {
  if (!paletteId || paletteId === 'mixed' || !colorCode) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
        <a href="/colors/" className="text-sm font-medium text-[var(--accent)] hover:underline">
          Back to colour charts
        </a>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Colour not found</h1>
        <p className="mt-2 text-[var(--muted)]">Pick a brand and colour from the colour charts.</p>
      </main>
    )
  }

  const palette = getBeadPalette(paletteId)
  const color = findColor(palette, decodeURIComponent(colorCode))

  if (!color) {
    return (
      <main className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
        <a href={`/colors/${palette.id}/`} className="text-sm font-medium text-[var(--accent)] hover:underline">
          Back to {palette.label}
        </a>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Colour not found</h1>
        <p className="mt-2 text-[var(--muted)]">
          Could not find {decodeURIComponent(colorCode)} in {palette.label}.
        </p>
      </main>
    )
  }

  const matches = closestMatches(palette.id, color)

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:items-stretch">
        <div className="flex flex-col gap-3">
          <a href={`/colors/${palette.id}/`} className="text-sm font-medium text-[var(--accent)] hover:underline">
            Back to {palette.label}
          </a>
          <p className="text-sm font-medium uppercase tracking-wide text-[var(--accent)]">
            {palette.label} colour
          </p>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
            {palette.label} {color.code}
          </h1>
          <p className="max-w-2xl text-[var(--muted)]">
            {color.name ?? `${palette.label} ${color.code}`} with hex, RGB, bead size, and closest cross-brand
            matches.
          </p>
          {palette.sourceUrl && (
            <p className="max-w-2xl text-sm text-[var(--muted)]">
              Source:{' '}
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
        </div>
        <ColorSwatch color={color} />
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetadataCard label="Colour name" value={color.name ?? color.code} />
        <MetadataCard label="HEX" value={color.hex} />
        <MetadataCard label="RGB" value={rgbLabel(color.hex)} />
        <MetadataCard label="Bead size" value={beadSizeLabel(palette.id)} />
      </section>

      <section className="mt-10">
        <div className="flex flex-col gap-2 border-b border-black/10 pb-3">
          <p className="text-sm font-medium uppercase tracking-wide text-[var(--accent)]">Cross-brand matches</p>
          <h2 className="text-2xl font-semibold tracking-tight">Closest equivalent shades</h2>
          <p className="max-w-3xl text-sm text-[var(--muted)]">
            Matches use Delta E 2000 over the stored digital RGB values. Physical beads can vary by batch,
            material, lighting, and screen calibration.
          </p>
        </div>
        <div className="mt-5 grid gap-3">
          {matches.map((match) => (
            <MatchCard key={match.palette.id} match={match} />
          ))}
        </div>
      </section>
    </main>
  )
}
