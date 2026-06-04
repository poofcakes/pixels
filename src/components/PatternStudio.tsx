'use client'

import {
  Brush,
  Copy,
  Coffee,
  Download,
  Eraser,
  FileText,
  FlipHorizontal2,
  PaintBucket,
  Pipette,
  Loader2,
  Maximize2,
  MousePointer2,
  Undo2,
  X,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import {
  BeadCountList,
  type BeadStatRow,
  type BeadStatSortMode,
} from '@/components/BeadCountList'
import { ColorReplacementPicker } from '@/components/ColorReplacementPicker'
import {
  MergeSimilarPopover,
  MergeSimilarToolbarButton,
} from '@/components/PatternEditPanel'
import { PatternPreviewGrid } from '@/components/PatternPreviewGrid'
import type { StudioTool } from '@/components/patternStudioTypes'
import type { BeadPattern, PatternGridDisplay } from '@/lib/beadPattern'
import type { BeadPalette } from '@/lib/beadPalettes'
import {
  MIN_READABLE_LABEL_CELL_PX,
  exportCellPxForPattern,
  renderPatternExportToCanvas,
} from '@/lib/beadPattern'
import { canvasToPdfBlob } from '@/lib/patternPdf'
import { replaceColorOverrides } from '@/lib/patternEdits'
import { shouldUseCanvasPreview } from '@/lib/patternPerformance'
import { rulerBandSize } from '@/lib/patternRuler'
import { cn } from '@/lib/utils'

type PatternStudioProps = {
  pattern: BeadPattern
  basePattern: BeadPattern
  palette: BeadPalette
  projectName: string
  gridDisplay: PatternGridDisplay
  usePaletteColors: boolean
  cellPx: number
  onCellPxChange: (px: number) => void
  onAutoCellPxChange: (px: number) => void
  usePaletteColorsToggle: boolean
  onUsePaletteColorsChange: (v: boolean) => void
  showCodes: boolean
  onShowCodesChange: (v: boolean) => void
  showGridGuidesOnTop: boolean
  onShowGridGuidesOnTopChange: (v: boolean) => void
  includePoofPixelsHandle: boolean
  onIncludePoofPixelsHandleChange: (v: boolean) => void
  completedCodes: ReadonlySet<string>
  selectedCode: string | null
  onSelectCode: (code: string | null) => void
  brushCode: string
  brushHex: string
  onBrushCodeChange: (code: string) => void
  statRows: BeadStatRow[]
  statsSortMode: BeadStatSortMode
  onStatsSortModeChange: (mode: BeadStatSortMode) => void
  hovered: { x: number; y: number } | null
  onHover: (cell: { x: number; y: number } | null) => void
  hoveredCode: string | null
  colorOverrides: Record<string, string>
  hasEdits: boolean
  onPushOverrides: (overrides: Record<string, string>) => void
  onUndo: () => void
  onResetEdits: () => void
  canUndo: boolean
  onPaintCell: (x: number, y: number, tool: StudioTool) => void
  onMirrorHorizontal: () => void
  onExtendCanvas: (side: 'top' | 'right' | 'bottom' | 'left', count: number) => void | Promise<void>
  onPaintStrokeStart: () => void
  onPaintStrokeEnd: () => void
  onCopyBreakdown: () => void
  onToggleComplete: (code: string) => void
  generatorSettingsPanel?: ReactNode
  pegboardSettingsPanel?: ReactNode
  loading?: boolean
}

function exportFileBaseName(
  name: string,
  options: { showCodes: boolean; showGridGuidesOnTop: boolean },
): string {
  const baseName =
    name
      .trim()
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pattern'
  const unbrandedName = baseName.replace(/-poofpixels$/i, '')
  const layoutTags = [
    options.showCodes ? 'with-codes' : 'without-codes',
    options.showGridGuidesOnTop ? 'with-grid' : 'without-grid',
  ]

  return `${unbrandedName}-poofpixels-${layoutTags.join('-')}`
}

const BEAD_PITCH_CM = 0.26

function formatRealSizeCm(width: number, height: number): string {
  const format = (beads: number) => (beads * BEAD_PITCH_CM).toFixed(1)
  return `${format(width)}×${format(height)} cm`
}

export function PatternStudio({
  pattern,
  basePattern,
  palette,
  projectName,
  gridDisplay,
  usePaletteColors,
  cellPx,
  onCellPxChange,
  onAutoCellPxChange,
  usePaletteColorsToggle,
  onUsePaletteColorsChange,
  showCodes,
  onShowCodesChange,
  showGridGuidesOnTop,
  onShowGridGuidesOnTopChange,
  includePoofPixelsHandle,
  onIncludePoofPixelsHandleChange,
  completedCodes,
  selectedCode,
  onSelectCode,
  brushCode,
  brushHex,
  onBrushCodeChange,
  statRows,
  statsSortMode,
  onStatsSortModeChange,
  hovered,
  onHover,
  hoveredCode,
  colorOverrides,
  hasEdits,
  onPushOverrides,
  onUndo,
  onResetEdits,
  canUndo,
  onPaintCell,
  onMirrorHorizontal,
  onExtendCanvas,
  onPaintStrokeStart,
  onPaintStrokeEnd,
  onCopyBreakdown,
  onToggleComplete,
  generatorSettingsPanel,
  pegboardSettingsPanel,
  loading,
}: PatternStudioProps) {
  const t = useTranslations('pattern')
  const [tool, setTool] = useState<StudioTool>('select')
  const [replaceCode, setReplaceCode] = useState<string | null>(null)
  const [brushPickerOpen, setBrushPickerOpen] = useState(false)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [buildMode, setBuildMode] = useState(false)
  const [extendCount, setExtendCount] = useState(1)
  const mergePopoverRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const paintingRef = useRef(false)

  useEffect(() => {
    if (!mergeOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (mergePopoverRef.current?.contains(event.target as Node)) return
      setMergeOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [mergeOpen])

  useEffect(() => {
    if (!buildMode) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBuildMode(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [buildMode])

  useEffect(() => {
    const container = previewContainerRef.current
    if (!container) return

    const updateAutoZoom = () => {
      const contentWidth = Math.max(1, container.clientWidth - 32)
      let nextCellPx = showCodes ? MIN_READABLE_LABEL_CELL_PX : 1
      for (let px = 48; px >= 1; px--) {
        const rulerPx = rulerBandSize(px)
        const gridGapsPx = Math.max(0, pattern.width - 1)
        const rulerGapsPx = 2
        const renderedWidth = rulerPx * 2 + rulerGapsPx + pattern.width * px + gridGapsPx
        if (renderedWidth <= contentWidth) {
          nextCellPx = showCodes ? Math.max(px, MIN_READABLE_LABEL_CELL_PX) : px
          break
        }
      }
      onAutoCellPxChange(nextCellPx)
    }

    updateAutoZoom()
    const observer = new ResizeObserver(updateAutoZoom)
    observer.observe(container)
    return () => observer.disconnect()
  }, [onAutoCellPxChange, pattern.height, pattern.width, showCodes])

  const replaceHex =
    statRows.find((r) => r.code === replaceCode)?.hex ?? brushHex
  const exportName = exportFileBaseName(projectName, { showCodes, showGridGuidesOnTop })
  const exportGridDisplay = useMemo(
    () => ({ ...gridDisplay, useMardColors: true }),
    [gridDisplay],
  )
  const hoveredCell = hovered
    ? pattern.cells[hovered.y * pattern.width + hovered.x]
    : null
  const hoveredBead = hoveredCell?.bead ?? null

  const handleCellAction = useCallback(
    (x: number, y: number) => {
      onPaintCell(x, y, tool)
    },
    [onPaintCell, tool],
  )

  const handleSelectCode = useCallback(
    (code: string | null) => {
      setTool('select')
      onSelectCode(code)
    },
    [onSelectCode],
  )

  const clampedExtendCount = Math.max(1, Math.floor(extendCount) || 1)

  const startPaint = useCallback(() => {
    paintingRef.current = true
    onPaintStrokeStart()
  }, [onPaintStrokeStart])

  const endPaint = useCallback(() => {
    paintingRef.current = false
    onPaintStrokeEnd()
  }, [onPaintStrokeEnd])

  useEffect(() => {
    window.addEventListener('pointerup', endPaint)
    return () => window.removeEventListener('pointerup', endPaint)
  }, [endPaint])

  const downloadPng = useCallback(async () => {
    const exportCellPx = exportCellPxForPattern(pattern, exportGridDisplay)
    const canvas = await renderPatternExportToCanvas(pattern, exportCellPx, exportGridDisplay, {
      includePoofPixelsHandle,
    })
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${exportName}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    })
  }, [pattern, exportName, exportGridDisplay, includePoofPixelsHandle])

  const downloadPdf = useCallback(async () => {
    const exportCellPx = exportCellPxForPattern(pattern, exportGridDisplay)
    const canvas = await renderPatternExportToCanvas(pattern, exportCellPx, exportGridDisplay, {
      includePoofPixelsHandle,
    })
    const blob = canvasToPdfBlob(canvas)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${exportName}.pdf`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [pattern, exportName, exportGridDisplay, includePoofPixelsHandle])

  return (
    <div
      className={cn(
        'flex min-h-[min(720px,80vh)] min-w-0 flex-col gap-4 rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm lg:sticky lg:top-4',
        buildMode && 'relative z-[100]',
      )}
    >
      {!buildMode && generatorSettingsPanel}

      <section
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-4',
          buildMode
            ? 'fixed inset-0 z-[100] overflow-hidden rounded-none border-0 bg-[#fff8fd] p-3 shadow-2xl sm:p-5'
            : 'rounded-xl border border-black/10 bg-white/70 p-3',
        )}
      >
        <div
          className={cn(
            'flex flex-wrap items-start justify-between gap-2',
            buildMode && 'shrink-0 rounded-xl border border-black/10 bg-white px-3 py-2 shadow-sm',
          )}
        >
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
              {t('step4Label')}
            </span>
            <span className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
              {t('step4Title')}
            </span>
            <p className="text-xs text-[var(--muted)]">{t('step4Warning')}</p>
          </div>
          <div className="flex min-h-5 flex-wrap items-center justify-end gap-2">
            {hasEdits && (
              <span className="rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-2 py-0.5 text-xs font-medium text-[#34205f]">
                {t('editedBadge')}
              </span>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1.5 text-xs text-[var(--muted)] transition-opacity',
                loading ? 'opacity-100' : 'pointer-events-none opacity-0',
              )}
              aria-hidden={!loading}
            >
              <Loader2 className="size-3.5 animate-spin" />
              {t('processing')}
            </span>
            <button
              type="button"
              onClick={() => setBuildMode((open) => !open)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-black/[0.04]',
                buildMode && 'border-[#34205f] bg-[#34205f] text-white hover:bg-[#34205f]/90',
              )}
            >
              {buildMode ? <X className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              {buildMode ? t('exitBuildMode') : t('buildMode')}
            </button>
          </div>
        </div>

        <div
          className={cn(
            'grid min-w-0 items-stretch gap-4',
            buildMode
              ? 'min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)_minmax(180px,35vh)_auto] overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:grid-rows-[auto_minmax(0,1fr)_auto]'
              : 'xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]',
          )}
        >
          <div
            className={cn(
              'flex flex-wrap items-center gap-3',
              buildMode ? 'lg:col-span-2' : 'xl:col-span-2',
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  ['select', MousePointer2, t('toolSelect')],
                  ['brush', Brush, t('toolBrush')],
                  ['bucket', PaintBucket, t('toolBucket')],
                  ['eraser', Eraser, t('toolEraser')],
                  ['picker', Pipette, t('toolPicker')],
                ] as const
              ).map(([id, Icon, label]) => (
                <button
                  key={id}
                  type="button"
                  title={label}
                  onClick={() => setTool(id)}
                  className={cn(
                    'flex size-9 items-center justify-center rounded-lg border transition-colors',
                    tool === id
                      ? 'border-[#34205f] bg-[#34205f] text-white'
                      : 'border-black/15 bg-white hover:bg-black/[0.04]',
                  )}
                  aria-pressed={tool === id}
                >
                  <Icon className="size-4" />
                </button>
              ))}
              <button
                type="button"
                className="ml-1 size-8 rounded-md border border-black/15"
                style={{ backgroundColor: brushHex }}
                title={brushCode}
                aria-label={t('brushDialogTitle')}
                onClick={() => setBrushPickerOpen(true)}
              />
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                className="flex size-9 items-center justify-center rounded-lg border border-black/15 disabled:opacity-40"
                title={t('undoEdit')}
              >
                <Undo2 className="size-4" />
              </button>
              <button
                type="button"
                onClick={onMirrorHorizontal}
                className="flex size-9 items-center justify-center rounded-lg border border-black/15 bg-white hover:bg-black/[0.04]"
                title={t('mirrorHorizontal')}
                aria-label={t('mirrorHorizontal')}
              >
                <FlipHorizontal2 className="size-4" />
              </button>
              <div className="relative" ref={mergePopoverRef}>
                <MergeSimilarToolbarButton
                  open={mergeOpen}
                  onToggle={() => setMergeOpen((open) => !open)}
                />
                <MergeSimilarPopover
                  open={mergeOpen}
                  basePattern={basePattern}
                  colorOverrides={colorOverrides}
                  onPushOverrides={onPushOverrides}
                  onReset={onResetEdits}
                  onClose={() => setMergeOpen(false)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1 rounded-lg border border-black/10 bg-white/70 px-2 py-1 text-xs">
                <span className="text-[var(--muted)]">{t('extendCanvasLabel')}</span>
                <input
                  type="number"
                  min={1}
                  max={256}
                  value={extendCount}
                  onChange={(e) => setExtendCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-14 rounded border border-black/15 bg-white px-1.5 py-1 font-mono text-xs"
                  aria-label={t('extendCanvasAmount')}
                />
                {(
                  [
                    ['top', t('extendCanvasTop')],
                    ['right', t('extendCanvasRight')],
                    ['bottom', t('extendCanvasBottom')],
                    ['left', t('extendCanvasLeft')],
                  ] as const
                ).map(([side, label]) => (
                  <button
                    key={side}
                    type="button"
                    onClick={() => void onExtendCanvas(side, clampedExtendCount)}
                    className="rounded-md border border-black/15 px-2 py-1 hover:bg-black/[0.04]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="ml-auto flex items-center gap-2 text-sm">
              <span className="text-[var(--muted)]">{t('zoomLabel')}</span>
              <input
                type="range"
                min={1}
                max={48}
                value={cellPx}
                onChange={(e) => onCellPxChange(Number(e.target.value))}
                className="w-28 accent-[var(--accent)]"
              />
              <span className="w-10 font-mono text-xs">{cellPx}px</span>
            </label>
            <div className="flex min-w-[12rem] items-center gap-2 rounded-lg border border-black/10 bg-white/70 px-2 py-1 text-xs">
              <span
                className="size-5 shrink-0 rounded border border-black/10"
                style={{ backgroundColor: hoveredBead?.hex ?? 'transparent' }}
              />
              <span className="min-w-0">
                <span className="block font-mono font-semibold">
                  {hoveredBead?.code ?? t('hoveredColorEmpty')}
                </span>
                <span className="block truncate text-[var(--muted)]">
                  {hoveredBead
                    ? t('hoveredColorMeta', {
                        row: (hovered?.y ?? 0) + 1,
                        col: (hovered?.x ?? 0) + 1,
                      })
                    : t('hoveredColorHint')}
                </span>
              </span>
            </div>
          </div>

          <div
            ref={previewContainerRef}
            className={cn(
              'min-h-0 overflow-auto rounded-xl border border-black/10 bg-[#f5edf4] p-4 [scrollbar-gutter:stable_both-edges]',
              buildMode ? 'h-full' : 'h-[min(65vh,720px)]',
            )}
            onPointerUp={endPaint}
            onPointerLeave={endPaint}
          >
            <PatternPreviewGrid
              pattern={pattern}
              basePattern={basePattern}
              cellPx={cellPx}
              gridDisplay={gridDisplay}
              usePaletteColors={usePaletteColors}
              completedCodes={completedCodes}
              selectedCode={tool === 'select' ? selectedCode : null}
              hovered={hovered}
              onHover={onHover}
              onSelectCode={handleSelectCode}
              studioTool={tool}
              onCellAction={handleCellAction}
              onPaintStart={startPaint}
              isPainting={() => paintingRef.current}
            />
          </div>

          <div
            className={cn(
              'flex min-h-0 flex-col overflow-hidden rounded-xl border border-black/10 bg-white/80 p-3',
              buildMode ? 'h-full' : 'h-[min(65vh,720px)]',
            )}
          >
            <BeadCountList
              pattern={pattern}
              rows={statRows}
              sortMode={statsSortMode}
              selectedCode={selectedCode}
              hoveredCode={hoveredCode}
              completedCodes={completedCodes}
              onSortModeChange={onStatsSortModeChange}
              onSelectCode={handleSelectCode}
              onReplaceCode={setReplaceCode}
              onToggleComplete={onToggleComplete}
            />
          </div>

          <div
            className={cn(
              'flex flex-col gap-2 border-t border-black/10 pt-3',
              buildMode ? 'lg:col-span-2' : 'xl:col-span-2',
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-medium tabular-nums">
                {t('footerSummary', {
                  beads: pattern.totalBeads.toLocaleString(),
                  colors: pattern.uniqueColors,
                  width: pattern.designWidth ?? pattern.width,
                  height: pattern.designHeight ?? pattern.height,
                  sizeCm: formatRealSizeCm(
                    pattern.designWidth ?? pattern.width,
                    pattern.designHeight ?? pattern.height,
                  ),
                })}
              </p>
              {buildMode ? (
                <div
                  className="ml-auto inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#34205f]"
                  aria-label="Poofpixels"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/poofpixels-logo.webp" alt="" className="h-7 w-auto" />
                  <span className="hidden sm:inline">Poofpixels</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={onCopyBreakdown}
                  className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                >
                  <Copy className="size-3.5" />
                  {t('copyBreakdown')}
                </button>
              )}
            </div>

            {shouldUseCanvasPreview(pattern.width * pattern.height) && (
              <p className="text-xs text-[var(--muted)]">
                {t('canvasPreviewNote', { count: pattern.width * pattern.height })}
              </p>
            )}
          </div>
        </div>

        {!buildMode && (
          <section className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                {t('step5Label')}
              </span>
              <span className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
                {t('step5Title')}
              </span>
            </div>
            <p className="max-w-xl text-xs text-[var(--muted)]">{t('step5Hint')}</p>
          </div>
          <div className="grid gap-3 xl:grid-cols-[minmax(220px,320px)_minmax(0,1fr)]">
            <div className="rounded-lg border border-black/10 bg-[#fbf7fb] p-3">
              <div className="flex flex-col gap-2 text-sm">
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={!usePaletteColorsToggle}
                    onChange={(e) => onUsePaletteColorsChange(!e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  {t('compareOriginalColors')}
                </label>
                <p className="-mt-1 text-xs text-[var(--muted)]">
                  {t('compareOriginalColorsHint')}
                </p>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showCodes}
                    onChange={(e) => onShowCodesChange(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  {t('showCodes', { palette: palette.label })}
                </label>
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={showGridGuidesOnTop}
                    onChange={(e) => onShowGridGuidesOnTopChange(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  {t('showGridGuidesOnTop')}
                </label>
              </div>
            </div>
            {pegboardSettingsPanel}
          </div>
          </section>
        )}

        {!buildMode && (
          <section className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-3">
            <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(280px,420px)] md:items-start">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                    {t('step6Label')}
                  </span>
                  <span className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
                    {t('step6Title')}
                  </span>
                  <p className="text-xs text-[var(--muted)]">{t('step6Hint')}</p>
                </div>
                <label className="flex w-fit cursor-pointer items-center gap-1.5 text-xs text-[var(--muted)]/70">
                  <input
                    type="checkbox"
                    checked={includePoofPixelsHandle}
                    onChange={(e) => onIncludePoofPixelsHandleChange(e.target.checked)}
                    className="size-3.5 accent-[#8b7894] opacity-70"
                  />
                  <span>{t('includePoofPixelsHandle')}</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void downloadPng()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm text-white hover:opacity-90"
                  >
                    <Download className="size-4" />
                    {t('downloadPng')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void downloadPdf()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-black/15 bg-white px-3 py-2 text-sm hover:bg-black/[0.04]"
                  >
                    <FileText className="size-4" />
                    {t('downloadPdf')}
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-xl border border-[#f19ac7]/30 bg-[#f19ac7]/10 p-3">
                <p className="text-sm text-[#6d3152]">{t('supportKoFiText')}</p>
                <a
                  href="https://ko-fi.com/U7U75ESN"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex w-fit items-center justify-center gap-1.5 rounded-md bg-[#f19ac7] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
                >
                  <Coffee className="size-4" />
                  {t('supportKoFiButton')}
                </a>
              </div>
            </div>
          </section>
        )}
      </section>

      <ColorReplacementPicker
        open={replaceCode !== null}
        palette={palette}
        replacingCode={replaceCode ?? ''}
        replacingHex={replaceHex}
        onClose={() => setReplaceCode(null)}
        onPick={(code) => {
          if (!replaceCode) return
          onPushOverrides(
            replaceColorOverrides(basePattern, colorOverrides, replaceCode, code),
          )
        }}
      />
      <ColorReplacementPicker
        open={brushPickerOpen}
        palette={palette}
        replacingCode={brushCode}
        replacingHex={brushHex}
        title={t('brushDialogTitle')}
        hint={t('brushDialogHint')}
        onClose={() => setBrushPickerOpen(false)}
        onPick={(code) => {
          onBrushCodeChange(code)
        }}
      />
    </div>
  )
}
