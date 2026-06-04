'use client'

import type { BeadColor } from '@/lib/beadPalettes'
import { getBeadPalette } from '@/lib/beadPalettes'
import { isLightHex } from '@/lib/mardColors'
import { cn } from '@/lib/utils'

type ComparisonRow = {
  key: string
  mard: BeadColor | null
  artkal: BeadColor | null
  rgbDiff: number | null
}

function stripArtkalMPrefix(code: string): string {
  return code.replace(/^M(?=[A-Z]+\d+$)/, '')
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ]
}

function rgbDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a)
  const [br, bg, bb] = hexToRgb(b)
  return Math.round(Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2))
}

function diffLabel(diff: number | null): string {
  if (diff === null) return 'Missing pair'
  if (diff <= 8) return 'Very close'
  if (diff <= 28) return 'Close'
  if (diff <= 60) return 'Different'
  return 'Very different'
}

function diffClass(diff: number | null): string {
  if (diff === null) return 'border-black/10 bg-black/[0.03] text-[var(--muted)]'
  if (diff <= 8) return 'border-emerald-200 bg-emerald-50 text-emerald-800'
  if (diff <= 28) return 'border-lime-200 bg-lime-50 text-lime-800'
  if (diff <= 60) return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-rose-200 bg-rose-50 text-rose-800'
}

function ColorCard({
  color,
  fallbackCode,
}: {
  color: BeadColor | null
  fallbackCode: string
}) {
  if (!color) {
    return (
      <div className="flex min-h-24 flex-col justify-between rounded-xl border border-dashed border-black/15 bg-black/[0.03] p-3 text-xs text-[var(--muted)]">
        <span className="font-mono font-semibold">{fallbackCode}</span>
        <span>Not in palette</span>
      </div>
    )
  }

  const light = isLightHex(color.hex)

  return (
    <div
      className={cn(
        'flex min-h-24 flex-col justify-between rounded-xl border p-3 font-mono text-xs shadow-sm',
        light ? 'border-black/10 text-black/80' : 'border-white/15 text-white/90',
      )}
      style={{ backgroundColor: color.hex }}
      title={`${color.code} ${color.hex}`}
    >
      <span className="font-bold">{color.code}</span>
      <span>{color.hex}</span>
    </div>
  )
}

function buildComparisonRows(): ComparisonRow[] {
  const mardColors = getBeadPalette('mard').colors
  const artkalColors = getBeadPalette('artkalM').colors
  const artkalByMardCode = new Map(artkalColors.map((color) => [stripArtkalMPrefix(color.code), color]))
  const mardByCode = new Map(mardColors.map((color) => [color.code, color]))
  const rows: ComparisonRow[] = mardColors.map((mard) => {
    const artkal = artkalByMardCode.get(mard.code) ?? null
    return {
      key: mard.code,
      mard,
      artkal,
      rgbDiff: artkal ? rgbDistance(mard.hex, artkal.hex) : null,
    }
  })

  for (const artkal of artkalColors) {
    const key = stripArtkalMPrefix(artkal.code)
    if (mardByCode.has(key)) continue
    rows.push({
      key,
      mard: null,
      artkal,
      rgbDiff: null,
    })
  }

  return rows
}

export function MardArtkalComparisonPage() {
  const rows = buildComparisonRows()
  const matchedRows = rows.filter((row) => row.mard && row.artkal)
  const mardOnlyRows = rows.filter((row) => row.mard && !row.artkal)
  const artkalOnlyRows = rows.filter((row) => !row.mard && row.artkal)
  const veryCloseCount = matchedRows.filter((row) => row.rgbDiff !== null && row.rgbDiff <= 8).length

  return (
    <main className="mx-auto max-w-[min(1500px,100vw)] px-4 py-10 sm:py-12">
      <header className="flex max-w-4xl flex-col gap-3">
        <a href="/colors/" className="text-sm font-medium text-[var(--accent)] hover:underline">
          Back to colour charts
        </a>
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--accent)]">
          Palette comparison
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          MARD and Artkal-M side by side
        </h1>
        <p className="max-w-3xl text-[var(--muted)]">
          Artkal-M mostly mirrors the MARD code scheme with an extra leading M, so this view lines up
          MARD A1 with Artkal MA1, B1 with MB1, and so on.
        </p>
      </header>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Matched pairs</p>
          <p className="mt-1 text-3xl font-semibold text-[#34205f]">{matchedRows.length}</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Very close RGB</p>
          <p className="mt-1 text-3xl font-semibold text-[#34205f]">{veryCloseCount}</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">MARD only</p>
          <p className="mt-1 text-3xl font-semibold text-[#34205f]">{mardOnlyRows.length}</p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Artkal-M only</p>
          <p className="mt-1 text-3xl font-semibold text-[#34205f]">{artkalOnlyRows.length}</p>
        </div>
      </section>

      <section className="mt-8 overflow-hidden rounded-2xl border border-black/10 bg-white/85 shadow-sm">
        <div className="grid grid-cols-[minmax(5rem,0.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(7rem,0.8fr)] gap-3 border-b border-black/10 bg-[#fbf7fb] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--muted)] sm:px-4">
          <span>Base code</span>
          <span>MARD</span>
          <span>Artkal-M</span>
          <span>RGB diff</span>
        </div>
        <div className="divide-y divide-black/10">
          {rows.map((row) => (
            <article
              key={`${row.key}-${row.artkal?.code ?? 'missing'}`}
              className="grid grid-cols-[minmax(5rem,0.5fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(7rem,0.8fr)] items-stretch gap-3 px-3 py-3 sm:px-4"
            >
              <div className="flex items-center">
                <span className="rounded-full bg-[#34205f]/10 px-3 py-1 font-mono text-sm font-bold text-[#34205f]">
                  {row.key}
                </span>
              </div>
              <ColorCard color={row.mard} fallbackCode={row.key} />
              <ColorCard color={row.artkal} fallbackCode={`M${row.key}`} />
              <div className="flex items-center">
                <span className={cn('rounded-full border px-3 py-1 text-xs font-semibold', diffClass(row.rgbDiff))}>
                  {row.rgbDiff ?? 'n/a'} | {diffLabel(row.rgbDiff)}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
