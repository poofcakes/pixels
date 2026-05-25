'use client'

import { useCallback, useEffect, useRef } from 'react'

import {
  drawPatternGrid,
  type BeadPattern,
  type PatternGridDisplay,
} from '@/lib/beadPattern'
import {
  rulerBandSize,
  rulerFontSize,
  rulerLabelStep,
  shouldShowRulerLabel,
} from '@/lib/patternRuler'
import type { StudioTool } from '@/components/patternStudioTypes'
import { cn } from '@/lib/utils'

type PatternCanvasGridProps = {
  pattern: BeadPattern
  cellPx: number
  gridDisplay: PatternGridDisplay
  usePaletteColors: boolean
  completedCodes: ReadonlySet<string>
  selectedCode: string | null
  hovered: { x: number; y: number } | null
  onHover: (cell: { x: number; y: number } | null) => void
  onSelectCode: (code: string) => void
  studioTool?: StudioTool
  onCellAction?: (x: number, y: number) => void
  onPaintStart?: () => void
  isPainting?: () => boolean
}

export function PatternCanvasGrid({
  pattern,
  cellPx,
  gridDisplay,
  usePaletteColors,
  completedCodes,
  selectedCode,
  hovered,
  onHover,
  onSelectCode,
  studioTool,
  onCellAction,
  onPaintStart,
  isPainting,
}: PatternCanvasGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const canEditCells = Boolean(studioTool && studioTool !== 'select' && onCellAction)
  const canDragPaint = studioTool === 'brush' || studioTool === 'eraser'
  const rulerSize = rulerBandSize(cellPx)
  const labelSize = rulerFontSize(cellPx)
  const colStep = rulerLabelStep(pattern.width)
  const rowStep = rulerLabelStep(pattern.height)
  const gap = 1
  const gridW = pattern.width * cellPx
  const gridH = pattern.height * cellPx

  const paint = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    drawPatternGrid(ctx, pattern, cellPx, {
      display: gridDisplay,
      usePaletteColors,
      completedCodes,
      hovered,
      selectedCode,
    })
  }, [
    pattern,
    cellPx,
    gridDisplay,
    usePaletteColors,
    completedCodes,
    hovered,
    selectedCode,
  ])

  useEffect(() => {
    paint()
  }, [paint])

  const cellAt = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current
      if (!canvas) return null
      const rect = canvas.getBoundingClientRect()
      const x = Math.floor((clientX - rect.left) / cellPx)
      const y = Math.floor((clientY - rect.top) / cellPx)
      if (x < 0 || y < 0 || x >= pattern.width || y >= pattern.height) return null
      return { x, y }
    },
    [cellPx, pattern.width, pattern.height],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      onHover(cellAt(e.clientX, e.clientY))
    },
    [cellAt, onHover],
  )

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const cell = cellAt(e.clientX, e.clientY)
      if (!cell) return
      if (canEditCells) {
        onPaintStart?.()
        onCellAction?.(cell.x, cell.y)
        return
      }
      const idx = cell.y * pattern.width + cell.x
      const bead = pattern.cells[idx]?.bead
      if (bead) onSelectCode(bead.code)
    },
    [
      cellAt,
      onSelectCode,
      onCellAction,
      onPaintStart,
      pattern.cells,
      pattern.width,
      canEditCells,
    ],
  )

  const onPointerMovePaint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      onPointerMove(e)
      if (!canDragPaint || !isPainting?.()) return
      const cell = cellAt(e.clientX, e.clientY)
      if (cell) onCellAction?.(cell.x, cell.y)
    },
    [canDragPaint, cellAt, isPainting, onCellAction, onPointerMove],
  )

  return (
    <div className="inline-block">
      <div
        className="font-mono tabular-nums text-white/55"
        style={{
          display: 'grid',
          gridTemplateColumns: `${rulerSize}px ${gridW}px`,
          columnGap: gap,
        }}
        aria-hidden
      >
        <div style={{ width: rulerSize, height: rulerSize }} />
        <div
          className="flex items-end justify-center"
          style={{ width: gridW, height: rulerSize, fontSize: labelSize }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${pattern.width}, ${cellPx}px)`,
              columnGap: gap,
            }}
          >
            {Array.from({ length: pattern.width }, (_, x) => (
              <div
                key={`col-${x}`}
                className={cn(
                  'flex items-end justify-center',
                  hovered?.x === x && 'font-semibold text-white',
                )}
                style={{ width: cellPx, height: rulerSize }}
              >
                {shouldShowRulerLabel(x, pattern.width, colStep) ? x + 1 : null}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${rulerSize}px ${gridW}px`,
          columnGap: gap,
        }}
      >
        <div
          className="font-mono tabular-nums text-white/55"
          style={{
            display: 'grid',
            gridTemplateRows: `repeat(${pattern.height}, ${cellPx}px)`,
            rowGap: gap,
          }}
          aria-hidden
        >
          {Array.from({ length: pattern.height }, (_, y) => (
            <div
              key={`row-${y}`}
              className={cn(
                'flex items-center justify-end pr-1',
                hovered?.y === y && 'font-semibold text-white',
              )}
              style={{ width: rulerSize, height: cellPx, fontSize: labelSize }}
            >
              {shouldShowRulerLabel(y, pattern.height, rowStep) ? y + 1 : null}
            </div>
          ))}
        </div>

        <canvas
          ref={canvasRef}
          width={gridW}
          height={gridH}
          className="touch-none cursor-crosshair"
          onPointerMove={studioTool ? onPointerMovePaint : onPointerMove}
          onPointerLeave={() => onHover(null)}
          onPointerDown={onPointerDown}
        />
      </div>
    </div>
  )
}
