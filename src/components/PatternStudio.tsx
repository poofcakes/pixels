'use client'

import {
  Brush,
  Copy,
  Download,
  Eraser,
  FileText,
  FlipHorizontal2,
  PaintBucket,
  Pipette,
  Loader2,
  MousePointer2,
  Undo2,
} from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'

import { BeadCountList, type BeadStatRow } from '@/components/BeadCountList'
import { ColorReplacementPicker } from '@/components/ColorReplacementPicker'
import {
  MergeSimilarPopover,
  MergeSimilarToolbarButton,
} from '@/components/PatternEditPanel'
import { PatternPreviewGrid } from '@/components/PatternPreviewGrid'
import type { StudioTool } from '@/components/patternStudioTypes'
import type { BeadPattern, PatternGridDisplay } from '@/lib/beadPattern'
import type { BeadPalette } from '@/lib/beadPalettes'
import { exportCellPxForPattern, renderPatternExportToCanvas } from '@/lib/beadPattern'
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
  completedCodes: ReadonlySet<string>
  selectedCode: string | null
  onSelectCode: (code: string | null) => void
  brushCode: string
  brushHex: string
  onBrushCodeChange: (code: string) => void
  statRows: BeadStatRow[]
  hovered: { x: number; y: number } | null
  onHover: (cell: { x: number; y: number } | null) => void
  hoveredCode: string | null
  colorOverrides: Record<string, string>
  onPushOverrides: (overrides: Record<string, string>) => void
  onUndo: () => void
  onResetEdits: () => void
  canUndo: boolean
  onPaintCell: (x: number, y: number, tool: StudioTool) => void
  onMirrorHorizontal: () => void
  onPaintStrokeStart: () => void
  onPaintStrokeEnd: () => void
  onCopyBreakdown: () => void
  onToggleComplete: (code: string) => void
  generatorSettingsPanel?: ReactNode
  pegboardSettingsPanel?: ReactNode
  loading?: boolean
}

function exportFileBaseName(name: string): string {
  const baseName =
    name
      .trim()
      .replace(/\.[^.]+$/, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'pattern'

  return baseName.endsWith('-poofpixels') ? baseName : `${baseName}-poofpixels`
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
  completedCodes,
  selectedCode,
  onSelectCode,
  brushCode,
  brushHex,
  onBrushCodeChange,
  statRows,
  hovered,
  onHover,
  hoveredCode,
  colorOverrides,
  onPushOverrides,
  onUndo,
  onResetEdits,
  canUndo,
  onPaintCell,
  onMirrorHorizontal,
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
    const container = previewContainerRef.current
    if (!container) return

    const updateAutoZoom = () => {
      const contentWidth = Math.max(1, container.clientWidth - 32)
      let nextCellPx = 1
      for (let px = 48; px >= 1; px--) {
        const rulerPx = rulerBandSize(px)
        const gridGapsPx = Math.max(0, pattern.width - 1)
        const rowRulerGapPx = 1
        const renderedWidth = rulerPx + rowRulerGapPx + pattern.width * px + gridGapsPx
        if (renderedWidth <= contentWidth) {
          nextCellPx = px
          break
        }
      }
      onAutoCellPxChange(nextCellPx)
    }

    updateAutoZoom()
    const observer = new ResizeObserver(updateAutoZoom)
    observer.observe(container)
    return () => observer.disconnect()
  }, [onAutoCellPxChange, pattern.width])

  const replaceHex =
    statRows.find((r) => r.code === replaceCode)?.hex ?? brushHex
  const exportName = exportFileBaseName(projectName)

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

  const startPaint = useCallback(() => {
    paintingRef.current = true
    onPaintStrokeStart()
  }, [onPaintStrokeStart])

  const endPaint = useCallback(() => {
    paintingRef.current = false
    onPaintStrokeEnd()
  }, [onPaintStrokeEnd])

  const downloadPng = useCallback(async () => {
    const exportCellPx = exportCellPxForPattern(pattern)
    const canvas = await renderPatternExportToCanvas(pattern, exportCellPx, gridDisplay)
    canvas.toBlob((blob) => {
      if (!blob) return
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${exportName}.png`
      a.click()
      URL.revokeObjectURL(a.href)
    })
  }, [pattern, exportName, gridDisplay])

  const downloadPdf = useCallback(async () => {
    const exportCellPx = exportCellPxForPattern(pattern)
    const canvas = await renderPatternExportToCanvas(pattern, exportCellPx, gridDisplay)
    const blob = canvasToPdfBlob(canvas)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${exportName}.pdf`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [pattern, exportName, gridDisplay])

  return (
    <div className="flex min-h-[min(720px,80vh)] min-w-0 flex-col gap-4 rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm lg:sticky lg:top-4">
      {generatorSettingsPanel}

      <section className="flex min-h-0 flex-1 flex-col gap-4 rounded-xl border border-black/10 bg-white/70 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
              {t('step4Label')}
            </span>
            <span className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
              {t('step4Title')}
            </span>
            <p className="text-xs text-[var(--muted)]">{t('step4Warning')}</p>
          </div>
          <span
            className={cn(
              'inline-flex min-h-5 items-center gap-1.5 text-xs text-[var(--muted)] transition-opacity',
              loading ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            aria-hidden={!loading}
          >
            <Loader2 className="size-3.5 animate-spin" />
            {t('processing')}
          </span>
        </div>

        <div className="grid min-w-0 items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,380px)]">
          <div className="xl:col-span-2 flex flex-wrap items-center gap-3">
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
          </div>

          <div
            ref={previewContainerRef}
            className="min-h-0 max-h-[min(65vh,720px)] overflow-auto rounded-xl border border-black/10 bg-[#f5edf4] p-4 [scrollbar-gutter:stable_both-edges]"
            onPointerUp={endPaint}
            onPointerLeave={endPaint}
          >
            <PatternPreviewGrid
              pattern={pattern}
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

          <div className="flex h-full min-h-0 flex-col">
            <BeadCountList
              pattern={pattern}
              rows={statRows}
              selectedCode={selectedCode}
              hoveredCode={hoveredCode}
              completedCodes={completedCodes}
              onSelectCode={handleSelectCode}
              onReplaceCode={setReplaceCode}
              onToggleComplete={onToggleComplete}
            />
          </div>

          <div className="xl:col-span-2 flex flex-col gap-2 border-t border-black/10 pt-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <p className="font-medium tabular-nums">
                {t('footerSummary', {
                  beads: pattern.totalBeads.toLocaleString(),
                  colors: pattern.uniqueColors,
                  width: pattern.designWidth ?? pattern.width,
                  height: pattern.designHeight ?? pattern.height,
                })}
              </p>
              <button
                type="button"
                onClick={onCopyBreakdown}
                className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
              >
                <Copy className="size-3.5" />
                {t('copyBreakdown')}
              </button>
            </div>

            {shouldUseCanvasPreview(pattern.width * pattern.height) && (
              <p className="text-xs text-[var(--muted)]">
                {t('canvasPreviewNote', { count: pattern.width * pattern.height })}
              </p>
            )}
          </div>
        </div>

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
                    checked={usePaletteColorsToggle}
                    onChange={(e) => onUsePaletteColorsChange(e.target.checked)}
                    className="accent-[var(--accent)]"
                  />
                  {t('usePaletteColors', { palette: palette.label })}
                </label>
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

        <section className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white p-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
              {t('step6Label')}
            </span>
            <span className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
              {t('step6Title')}
            </span>
            <p className="text-xs text-[var(--muted)]">{t('step6Hint')}</p>
          </div>
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
        </section>
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
