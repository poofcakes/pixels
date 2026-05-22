'use client'

import { Check, Download, ImagePlus, Loader2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { BeadInventoryPicker } from '@/components/BeadInventoryPicker'
import { PatternEditPanel } from '@/components/PatternEditPanel'
import { PatternPreviewGrid } from '@/components/PatternPreviewGrid'
import {
  patternFromImageFile,
  renderPatternToCanvas,
  type BeadPattern,
  type PatternGridDisplay,
} from '@/lib/beadPattern'
import {
  BEAD_PALETTES,
  getBeadPalette,
  getPaletteColorCount,
  type BeadPaletteId,
} from '@/lib/beadPalettes'
import { BEAD_MATCH_METHODS, type BeadMatchMethod } from '@/lib/beadColorMatch'
import { applyPatternEdits } from '@/lib/patternEdits'
import { loadPatternPrefs, savePatternPrefs } from '@/lib/beadPatternPreferences'
import {
  loadCompletedCodes,
  patternFingerprint,
  saveCompletedCodes,
} from '@/lib/patternCompletedStorage'
import { shouldUseCanvasPreview } from '@/lib/patternPerformance'
import { loadEnabledStock, saveEnabledStock } from '@/lib/beadStockStorage'
import { cn } from '@/lib/utils'

type StatsSortMode = 'count' | 'code'

const EXAMPLE_PATTERNS = [
  { file: 'omok-piece-bloctopus.webp', name: 'Bloctopus' },
  { file: 'omok-piece-mushroom.webp', name: 'Mushroom' },
  { file: 'omok-piece-octopus.webp', name: 'Octopus' },
  { file: 'omok-piece-panda-teddy.webp', name: 'Panda teddy' },
  { file: 'omok-piece-pig.webp', name: 'Pig' },
  { file: 'omok-piece-pink-teddy.webp', name: 'Pink teddy' },
  { file: 'omok-piece-slime.webp', name: 'Slime' },
  { file: 'omok-piece-trixter.webp', name: 'Trixter' },
] as const

const beadCodeCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

type BeadPatternGeneratorProps = {
  exampleAssetBasePath?: string
}

function exampleAssetPath(basePath: string, file: string): string {
  return `${basePath.replace(/\/$/, '')}/${file}`
}

export function BeadPatternGenerator({
  exampleAssetBasePath = '/pixels/examples/omok',
}: BeadPatternGeneratorProps = {}) {
  const t = useTranslations('pattern')
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [basePattern, setBasePattern] = useState<BeadPattern | null>(null)
  const [overrideHistory, setOverrideHistory] = useState<Record<string, string>[]>([{}])
  const colorOverrides = useMemo(
    () => overrideHistory[overrideHistory.length - 1] ?? {},
    [overrideHistory],
  )
  const canUndoEdits = overrideHistory.length > 1

  const pushOverrides = useCallback((next: Record<string, string>) => {
    setOverrideHistory((history) => [...history, next])
  }, [])

  const undoOverrides = useCallback(() => {
    setOverrideHistory((history) => (history.length > 1 ? history.slice(0, -1) : history))
  }, [])

  const resetOverrides = useCallback(() => {
    setOverrideHistory([{}])
  }, [])
  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [trimTransparent, setTrimTransparent] = useState(true)
  const [removeBackground, setRemoveBackground] = useState(false)
  const [pixelBlockSize, setPixelBlockSize] = useState<number | 'auto'>('auto')
  const [paletteId, setPaletteId] = useState<BeadPaletteId>('mard')
  const [matchMethod, setMatchMethod] = useState<BeadMatchMethod>('lab76')
  const [restrictToStock, setRestrictToStock] = useState(false)
  const [enabledStock, setEnabledStock] = useState<Set<string>>(() => new Set())
  const [cellPx, setCellPx] = useState(20)
  const [usePaletteColors, setUsePaletteColors] = useState(true)
  const [showCodes, setShowCodes] = useState(false)
  const [statsSortMode, setStatsSortMode] = useState<StatsSortMode>('count')
  const [hovered, setHovered] = useState<{ x: number; y: number } | null>(null)
  const [completedCodes, setCompletedCodes] = useState<Set<string>>(() => new Set())
  const [loadingExample, setLoadingExample] = useState<string | null>(null)

  useEffect(() => {
    const prefs = loadPatternPrefs()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate browser-only preferences after SSR
    setRestrictToStock(prefs.restrictToStock)
    setUsePaletteColors(prefs.usePaletteColors)
  }, [])

  const setRestrictToStockPersisted = useCallback((value: boolean) => {
    setRestrictToStock(value)
    savePatternPrefs({ restrictToStock: value })
  }, [])

  const setUsePaletteColorsPersisted = useCallback((value: boolean) => {
    setUsePaletteColors(value)
    savePatternPrefs({ usePaletteColors: value })
  }, [])

  const palette = useMemo(() => getBeadPalette(paletteId), [paletteId])
  const paletteColorCount = getPaletteColorCount(paletteId)
  const allCodes = useMemo(() => palette.colors.map((c) => c.code), [palette.colors])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate stock after palette changes
    setEnabledStock(loadEnabledStock(paletteId, allCodes))
  }, [paletteId, allCodes])

  const handleStockChange = useCallback(
    (next: Set<string>) => {
      setEnabledStock(next)
      saveEnabledStock(paletteId, next)
    },
    [paletteId],
  )

  const gridDisplay = useMemo<PatternGridDisplay>(
    () => ({ useMardColors: usePaletteColors, label: showCodes ? 'code' : 'none' }),
    [usePaletteColors, showCodes],
  )

  const pattern = useMemo(
    () => (basePattern ? applyPatternEdits(basePattern, colorOverrides) : null),
    [basePattern, colorOverrides],
  )

  const runProcess = useCallback(
    (target: File) => {
      let cancelled = false
      setLoading(true)
      setError(null)

      if (restrictToStock && enabledStock.size === 0) {
        setError(t('stockEmpty'))
        setLoading(false)
        return () => {
          cancelled = true
        }
      }

      void patternFromImageFile(target, {
        paletteId,
        trimTransparent,
        removeBackground,
        pixelBlockSize,
        matchMethod,
        allowedCodes: restrictToStock ? enabledStock : null,
      })
        .then((result) => {
          if (!cancelled) {
            setBasePattern(result)
            setOverrideHistory([{}])
            setSelectedCode(null)
            setError(null)
          }
        })
        .catch((err) => {
          if (!cancelled) {
            const msg =
              err instanceof Error && err.message.includes('stock')
                ? t('stockEmpty')
                : t('errorLoad')
            setError(msg)
            setBasePattern(null)
            setOverrideHistory([{}])
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })

      return () => {
        cancelled = true
      }
    },
    [
      trimTransparent,
      removeBackground,
      pixelBlockSize,
      matchMethod,
      paletteId,
      restrictToStock,
      enabledStock,
      t,
    ],
  )

  // Rebuild pattern when the image or any processing setting changes.
  useEffect(() => {
    if (!file) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async rebuild on settings change
    return runProcess(file)
  }, [file, runProcess])

  const onPickFile = useCallback(
    (next: File | null) => {
      if (!next) return
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(next))
      setFile(next)
    },
    [previewUrl],
  )

  const onPickExample = useCallback(
    async (example: (typeof EXAMPLE_PATTERNS)[number]) => {
      setLoadingExample(example.file)
      setError(null)

      try {
        const response = await fetch(exampleAssetPath(exampleAssetBasePath, example.file))
        if (!response.ok) throw new Error(`Could not load example image: ${example.file}`)

        const blob = await response.blob()
        onPickFile(new File([blob], example.file, { type: blob.type || 'image/webp' }))
      } catch {
        setError(t('errorLoad'))
      } finally {
        setLoadingExample(null)
      }
    },
    [exampleAssetBasePath, onPickFile, t],
  )

  const patternSig = useMemo(
    () => (pattern ? patternFingerprint(pattern) : null),
    [pattern],
  )

  const usedCodes = useMemo(
    () => (pattern ? Object.keys(pattern.counts) : []),
    [pattern],
  )

  useEffect(() => {
    if (!patternSig || usedCodes.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset stored progress when no pattern exists
      setCompletedCodes(new Set())
      return
    }
    setCompletedCodes(loadCompletedCodes(patternSig, usedCodes))
  }, [patternSig, usedCodes])

  const toggleComplete = useCallback(
    (code: string) => {
      setCompletedCodes((prev) => {
        const next = new Set(prev)
        if (next.has(code)) next.delete(code)
        else next.add(code)
        if (patternSig) saveCompletedCodes(patternSig, next)
        return next
      })
    },
    [patternSig],
  )

  const clearCompleted = useCallback(() => {
    setCompletedCodes(new Set())
    if (patternSig) saveCompletedCodes(patternSig, new Set())
  }, [patternSig])

  const sortedStats = useMemo(() => {
    if (!pattern) return []
    return Object.entries(pattern.counts).sort((a, b) => {
      const aDone = completedCodes.has(a[0])
      const bDone = completedCodes.has(b[0])
      if (aDone !== bDone) return aDone ? 1 : -1
      if (statsSortMode === 'code') return beadCodeCollator.compare(a[0], b[0])
      return b[1] - a[1] || beadCodeCollator.compare(a[0], b[0])
    })
  }, [pattern, completedCodes, statsSortMode])

  const completedCount = useMemo(() => {
    if (!pattern) return 0
    return usedCodes.filter((c) => completedCodes.has(c)).length
  }, [pattern, usedCodes, completedCodes])

  const hexByCode = useMemo(() => {
    if (!pattern) return new Map<string, string>()
    const map = new Map<string, string>()
    for (const cell of pattern.cells) {
      if (cell.bead) map.set(cell.bead.code, cell.bead.hex)
    }
    return map
  }, [pattern])

  const hoveredCell = useMemo(() => {
    if (!pattern || !hovered) return null
    return pattern.cells.find((c) => c.x === hovered.x && c.y === hovered.y) ?? null
  }, [pattern, hovered])

  const hoveredCode = hoveredCell?.bead?.code ?? null

  const downloadPng = useCallback(() => {
    if (!pattern) return
    const canvas = renderPatternToCanvas(pattern, Math.max(8, cellPx), gridDisplay)
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${pattern.paletteId}-pattern-${pattern.width}x${pattern.height}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    })
  }, [pattern, cellPx, gridDisplay])

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,280px)_1fr]">
      <aside className="flex flex-col gap-6">
        <div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
          />
          {!file ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-black/15 bg-white/50 px-6 py-10 text-center transition-colors hover:border-[var(--accent)] hover:bg-white"
            >
              <ImagePlus className="size-8 text-[var(--accent)]" />
              <span className="font-medium">{t('uploadTitle')}</span>
              <span className="text-sm text-[var(--muted)]">{t('uploadHint')}</span>
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={previewUrl}
                  alt=""
                  className="mx-auto max-h-40 rounded-lg border border-black/10 bg-[#111] object-contain p-2"
                />
              )}
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-sm text-[var(--accent)] hover:underline"
              >
                {t('replaceImage')}
              </button>
            </div>
          )}
        </div>

        <section className="flex flex-col gap-2">
          <div>
            <h2 className="text-sm font-medium">{t('examplesTitle')}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{t('examplesHint')}</p>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {EXAMPLE_PATTERNS.map((example) => {
              const src = exampleAssetPath(exampleAssetBasePath, example.file)
              const busy = loadingExample === example.file

              return (
                <button
                  key={example.file}
                  type="button"
                  onClick={() => void onPickExample(example)}
                  disabled={Boolean(loadingExample)}
                  aria-label={t('exampleLoad', { name: example.name })}
                  className="group flex flex-col items-center gap-1 rounded-md border border-black/10 bg-white/70 p-1 text-center text-[10px] leading-tight transition-colors hover:border-[var(--accent)] hover:bg-white disabled:cursor-wait disabled:opacity-70"
                >
                  <span className="flex size-12 items-center justify-center overflow-hidden rounded bg-[#1a1814] p-1.5">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  </span>
                  <span className="flex max-w-full items-center gap-1 truncate font-medium">
                    {busy && <Loader2 className="size-3 animate-spin" />}
                    {example.name}
                  </span>
                </button>
              )
            })}
          </div>
        </section>

        <fieldset className="flex flex-col gap-4 text-sm" disabled={!file || loading}>
          <p className="text-xs text-[var(--muted)]">{t('oneToOneNote')}</p>

          <label className="flex flex-col gap-1.5">
            <span className="font-medium">{t('paletteLabel')}</span>
            <select
              value={paletteId}
              onChange={(e) => {
                setPaletteId(e.target.value as BeadPaletteId)
                setOverrideHistory([{}])
                setSelectedCode(null)
              }}
              className="rounded-md border border-black/15 bg-white px-3 py-2 text-sm"
            >
              {BEAD_PALETTES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label} ({getPaletteColorCount(p.id)})
                </option>
              ))}
            </select>
            <a
              href={palette.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-[var(--accent)] hover:underline"
            >
              {t('paletteChartLink', { palette: palette.label })}
            </a>
          </label>

          <BeadInventoryPicker
            paletteId={paletteId}
            enabled={enabledStock}
            onEnabledChange={handleStockChange}
          />

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={restrictToStock}
              onChange={(e) => setRestrictToStockPersisted(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="font-medium">{t('restrictToStock')}</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                {t('restrictToStockHint')}
              </span>
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-medium">{t('pixelBlockLabel')}</span>
            <select
              value={pixelBlockSize === 'auto' ? 'auto' : String(pixelBlockSize)}
              onChange={(e) => {
                const v = e.target.value
                setPixelBlockSize(v === 'auto' ? 'auto' : Number(v))
              }}
              className="rounded-md border border-black/15 bg-white px-3 py-2 font-mono text-sm"
            >
              <option value="auto">{t('pixelBlockAuto')}</option>
              <option value="1">{t('pixelBlock1')}</option>
              <option value="2">2×2</option>
              <option value="3">3×3</option>
              <option value="4">4×4</option>
              <option value="5">5×5</option>
              <option value="6">6×6</option>
              <option value="8">8×8</option>
            </select>
            <span className="text-xs text-[var(--muted)]">{t('pixelBlockHint')}</span>
            {pattern && pixelBlockSize === 'auto' && (
              <span className="rounded-md bg-[var(--accent)]/10 px-2 py-1 font-mono text-xs text-[var(--foreground)]">
                {pattern.pixelBlockSize > 1
                  ? t('pixelBlockDetected', {
                      block: pattern.pixelBlockSize,
                      width: pattern.width,
                      height: pattern.height,
                    })
                  : t('pixelBlockNoneDetected')}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="font-medium">{t('matchMethodLabel')}</span>
            <select
              value={matchMethod}
              onChange={(e) => setMatchMethod(e.target.value as BeadMatchMethod)}
              className="rounded-md border border-black/15 bg-white px-3 py-2 font-mono text-sm"
            >
              {BEAD_MATCH_METHODS.map((method) => (
                <option key={method} value={method}>
                  {t(`matchMethod.${method}`)}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--muted)]">{t(`matchMethodHint.${matchMethod}`)}</span>
          </label>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={trimTransparent}
              onChange={(e) => setTrimTransparent(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="font-medium">{t('trimTransparent')}</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">
                {t('trimTransparentHint')}
              </span>
            </span>
          </label>

          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={removeBackground}
              onChange={(e) => setRemoveBackground(e.target.checked)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="font-medium">{t('removeBg')}</span>
              <span className="mt-0.5 block text-xs text-[var(--muted)]">{t('removeBgHint')}</span>
            </span>
          </label>

          {basePattern && !loading && (
            <PatternEditPanel
              basePattern={basePattern}
              colorOverrides={colorOverrides}
              onPushOverrides={pushOverrides}
              onUndo={undoOverrides}
              onReset={resetOverrides}
              canUndo={canUndoEdits}
              selectedCode={selectedCode}
              onSelectCode={setSelectedCode}
            />
          )}
        </fieldset>

        <p className="text-xs text-[var(--muted)]">{t('privacy')}</p>
      </aside>

      <div className="flex min-w-0 flex-col gap-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <Loader2 className="size-4 animate-spin" />
            {t('processing')}
          </div>
        )}
        {error && <p className="text-sm text-red-700">{error}</p>}

        {!pattern && !loading && !error && (
          <p className="text-[var(--muted)]">{t('emptyPattern')}</p>
        )}

        {pattern && (
          <>
            <div className="flex flex-wrap items-end gap-4 text-sm">
              <p>
                <span className="text-[var(--muted)]">{t('gridSize')}: </span>
                <span className="font-mono font-medium">
                  {pattern.width} × {pattern.height}
                </span>
              </p>
              {pattern.pixelBlockSize > 1 && (
                <p className="text-xs text-[var(--muted)]">
                  {t('sourceReduced', {
                    sw: pattern.sourceWidth,
                    sh: pattern.sourceHeight,
                    block: pattern.pixelBlockSize,
                  })}
                </p>
              )}
              <p>
                <span className="text-[var(--muted)]">{t('totalBeads')}: </span>
                <span className="font-mono font-medium">{pattern.totalBeads}</span>
              </p>
              <p>
                <span className="text-[var(--muted)]">{t('uniqueColors')}: </span>
                <span className="font-mono font-medium">{pattern.uniqueColors}</span>
                <span className="text-[var(--muted)]"> / {paletteColorCount}</span>
              </p>
            </div>

            {pattern.importMeta && (
              <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-950">
                {t('imageScaledNote', {
                  fileWidth: pattern.importMeta.fileWidth,
                  fileHeight: pattern.importMeta.fileHeight,
                  analysisWidth: pattern.importMeta.analysisWidth,
                  analysisHeight: pattern.importMeta.analysisHeight,
                })}
              </p>
            )}
            {shouldUseCanvasPreview(pattern.width * pattern.height) && (
              <p className="text-xs text-[var(--muted)]">
                {t('canvasPreviewNote', { count: pattern.width * pattern.height })}
              </p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-sm">
              <label className="flex items-center gap-2">
                <span className="text-[var(--muted)]">{t('displayCell')}</span>
                <input
                  type="range"
                  min={12}
                  max={40}
                  value={cellPx}
                  onChange={(e) => setCellPx(Number(e.target.value))}
                  className="w-24 accent-[var(--accent)]"
                />
                <span className="font-mono">{cellPx}px</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={usePaletteColors}
                  onChange={(e) => setUsePaletteColorsPersisted(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                {t('usePaletteColors', { palette: palette.label })}
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={showCodes}
                  onChange={(e) => setShowCodes(e.target.checked)}
                  className="accent-[var(--accent)]"
                />
                {t('showCodes', { palette: palette.label })}
              </label>
              <button
                type="button"
                onClick={downloadPng}
                className="ml-auto inline-flex items-center gap-2 rounded-md bg-[var(--accent)] px-4 py-2 text-white hover:opacity-90"
              >
                <Download className="size-4" />
                {t('downloadPng')}
              </button>
            </div>


            <div className="overflow-auto rounded-xl border border-black/10 bg-[#1a1814] p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-white/60">
                {t('preview')}
              </p>
              <PatternPreviewGrid
                pattern={pattern}
                cellPx={cellPx}
                gridDisplay={gridDisplay}
                usePaletteColors={usePaletteColors}
                completedCodes={completedCodes}
                selectedCode={selectedCode}
                hovered={hovered}
                onHover={setHovered}
                onSelectCode={setSelectedCode}
              />
            </div>

            <section>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-lg font-semibold">{t('stats')}</h2>
                {sortedStats.length > 0 && (
                  <p className="text-sm text-[var(--muted)]">
                    {t('completedProgress', {
                      done: completedCount,
                      total: sortedStats.length,
                    })}
                    {completedCount > 0 && (
                      <>
                        {' · '}
                        <button
                          type="button"
                          onClick={clearCompleted}
                          className="text-[var(--accent)] hover:underline"
                        >
                          {t('clearCompleted')}
                        </button>
                      </>
                    )}
                  </p>
                )}
              </div>
              {sortedStats.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-[var(--muted)]">{t('statsSortLabel')}</span>
                  <div className="inline-flex overflow-hidden rounded-md border border-black/15 bg-white">
                    {(['count', 'code'] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setStatsSortMode(mode)}
                        className={cn(
                          'px-3 py-1.5 transition-colors',
                          statsSortMode === mode
                            ? 'bg-[var(--accent)] text-white'
                            : 'text-[var(--foreground)] hover:bg-black/[0.04]',
                        )}
                        aria-pressed={statsSortMode === mode}
                      >
                        {t(`statsSort.${mode}`)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {sortedStats.length === 0 ? (
                <p className="mt-2 text-sm text-[var(--muted)]">{t('statsEmpty')}</p>
              ) : (
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {sortedStats.map(([code, count]) => {
                    const hex = hexByCode.get(code) ?? '#888888'
                    const isHovered = hoveredCode === code
                    const isSelected = selectedCode === code
                    const isComplete = completedCodes.has(code)
                    return (
                      <li
                        key={code}
                        className={cn(
                          'flex items-center gap-2 rounded-lg border px-2 py-2 text-sm transition-colors',
                          isComplete && 'border-black/10 bg-black/[0.03] opacity-60',
                          !isComplete &&
                            isHovered &&
                            'border-[var(--accent)] bg-[var(--accent)]/10 ring-2 ring-[var(--accent)]',
                          !isComplete &&
                            !isHovered &&
                            isSelected &&
                            'border-[var(--accent)] bg-[var(--accent)]/5 ring-1 ring-[var(--accent)]',
                          !isComplete &&
                            !isHovered &&
                            !isSelected &&
                            'border-black/10 bg-white',
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => toggleComplete(code)}
                          aria-label={
                            isComplete ? t('markIncomplete', { code }) : t('markComplete', { code })
                          }
                          aria-pressed={isComplete}
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-md border transition-colors',
                            isComplete
                              ? 'border-green-600/40 bg-green-600/15 text-green-700'
                              : 'border-black/15 bg-white hover:bg-black/[0.04]',
                          )}
                        >
                          <Check className="size-4" strokeWidth={isComplete ? 3 : 2} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedCode(code)}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 text-left"
                        >
                          <span
                            className={cn(
                              'size-8 shrink-0 rounded-md border border-black/10',
                              isComplete && 'saturate-[0.35]',
                            )}
                            style={{ backgroundColor: hex }}
                          />
                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                'block font-mono font-semibold',
                                isComplete && 'line-through decoration-black/30',
                              )}
                            >
                              {code}
                            </span>
                            <span className="block font-mono text-xs text-[var(--muted)]">{hex}</span>
                          </span>
                          <span className="shrink-0 font-mono tabular-nums text-[var(--muted)]">
                            {count}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
