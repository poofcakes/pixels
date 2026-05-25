'use client'

import { Check } from 'lucide-react'

import {
  beadLabelFontSize,
  beadLabelTextColor,
  beadLabelTextShadow,
  cellFillColor,
  cellLabel,
  luminanceHexForCell,
  shouldDrawCellLabel,
  type BeadPattern,
  type PatternGridDisplay,
} from '@/lib/beadPattern'
import {
  rulerBandSize,
  rulerFontSize,
  rulerLabelStep,
  shouldShowRulerLabel,
} from '@/lib/patternRuler'
import { shouldUseCanvasPreview } from '@/lib/patternPerformance'
import { cn } from '@/lib/utils'

import type { StudioTool } from '@/components/patternStudioTypes'

import { PatternCanvasGrid } from './PatternCanvasGrid'

type PatternPreviewGridProps = {
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

export function PatternPreviewGrid({
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
}: PatternPreviewGridProps) {
  const cellCount = pattern.width * pattern.height
  const canEditCells = Boolean(studioTool && studioTool !== 'select' && onCellAction)
  const canDragPaint = studioTool === 'brush' || studioTool === 'eraser'

  if (shouldUseCanvasPreview(cellCount)) {
    return (
      <PatternCanvasGrid
        pattern={pattern}
        cellPx={cellPx}
        gridDisplay={gridDisplay}
        usePaletteColors={usePaletteColors}
        completedCodes={completedCodes}
        selectedCode={selectedCode}
        hovered={hovered}
        onHover={onHover}
        onSelectCode={onSelectCode}
        studioTool={studioTool}
        onCellAction={onCellAction}
        onPaintStart={onPaintStart}
        isPainting={isPainting}
      />
    )
  }

  const rulerSize = rulerBandSize(cellPx)
  const labelSize = rulerFontSize(cellPx)
  const colStep = rulerLabelStep(pattern.width)
  const rowStep = rulerLabelStep(pattern.height)
  const gap = 1
  const boardSize = gridDisplay.boardSize && gridDisplay.boardSize > 0 ? gridDisplay.boardSize : null
  const boardColumnLines = boardSize
    ? Array.from({ length: Math.ceil(pattern.width / boardSize) - 1 }, (_, i) => (i + 1) * boardSize)
    : []
  const boardRowLines = boardSize
    ? Array.from({ length: Math.ceil(pattern.height / boardSize) - 1 }, (_, i) => (i + 1) * boardSize)
    : []
  const guideColumnLines = Array.from(
    { length: Math.ceil(pattern.width / 5) - 1 },
    (_, i) => (i + 1) * 5,
  )
  const guideRowLines = Array.from(
    { length: Math.ceil(pattern.height / 5) - 1 },
    (_, i) => (i + 1) * 5,
  )
  const gridPixelWidth = pattern.width * cellPx + Math.max(0, pattern.width - 1) * gap
  const gridPixelHeight = pattern.height * cellPx + Math.max(0, pattern.height - 1) * gap
  const guideLineClass = gridDisplay.showGridGuidesOnTop
    ? 'bg-white/80 z-[25] shadow-[0_0_0_1px_rgba(0,0,0,0.25)]'
    : 'bg-white/75 z-[5]'

  return (
    <div className="inline-block">
      <div
        className="font-mono tabular-nums text-[#6f6280]/70"
        style={{
          display: 'grid',
          gridTemplateColumns: `${rulerSize}px repeat(${pattern.width}, ${cellPx}px) ${rulerSize}px`,
          columnGap: gap,
          rowGap: gap,
        }}
        aria-hidden
      >
        <div style={{ width: rulerSize, height: rulerSize }} />
        {Array.from({ length: pattern.width }, (_, x) => {
          const active = hovered?.x === x
          return (
            <div
              key={`col-${x}`}
              className={cn(
                'flex items-end justify-center',
                active && 'font-semibold text-[#34205f]',
              )}
              style={{
                width: cellPx,
                height: rulerSize,
                fontSize: labelSize,
              }}
            >
              {shouldShowRulerLabel(x, pattern.width, colStep) ? x + 1 : null}
            </div>
          )
        })}
        <div style={{ width: rulerSize, height: rulerSize }} />
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${rulerSize}px auto ${rulerSize}px`,
          columnGap: gap,
        }}
      >
        <div
          className="font-mono tabular-nums text-[#6f6280]/70"
          style={{
            display: 'grid',
            gridTemplateRows: `repeat(${pattern.height}, ${cellPx}px)`,
            rowGap: gap,
          }}
          aria-hidden
        >
          {Array.from({ length: pattern.height }, (_, y) => {
            const active = hovered?.y === y
            return (
              <div
                key={`row-${y}`}
                className={cn(
                  'flex items-center justify-end pr-1',
                  active && 'font-semibold text-[#34205f]',
                )}
                style={{
                  width: rulerSize,
                  height: cellPx,
                  fontSize: labelSize,
                }}
              >
                {shouldShowRulerLabel(y, pattern.height, rowStep) ? y + 1 : null}
              </div>
            )
          })}
        </div>

        <div
          className="relative isolate inline-grid gap-px"
          style={{
            gridTemplateColumns: `repeat(${pattern.width}, ${cellPx}px)`,
            width: gridPixelWidth,
            height: gridPixelHeight,
          }}
          onMouseLeave={() => onHover(null)}
        >
          {pattern.cells.map((cell) => {
            const fill = cellFillColor(cell, usePaletteColors)
            const codeLabel = shouldDrawCellLabel(gridDisplay.label, cellPx)
              ? cellLabel(cell, gridDisplay.label)
              : null
            const lumHex = luminanceHexForCell(cell, usePaletteColors)
            const isComplete = Boolean(cell.bead && completedCodes.has(cell.bead.code))
            const isDimmedBySelection = Boolean(
              selectedCode && cell.bead && cell.bead.code !== selectedCode,
            )

            return (
              <div
                key={`${cell.x}-${cell.y}`}
                title={
                  cell.bead
                    ? `${cell.bead.code} · ${cell.bead.hex} · row ${cell.y + 1}, col ${cell.x + 1}`
                    : undefined
                }
                onMouseEnter={() => {
                  onHover({ x: cell.x, y: cell.y })
                  if (canDragPaint && isPainting?.()) {
                    onCellAction?.(cell.x, cell.y)
                  }
                }}
                onPointerDown={(e) => {
                  if (!canEditCells) {
                    if (cell.bead) onSelectCode(cell.bead.code)
                    return
                  }
                  e.preventDefault()
                  if (canDragPaint) onPaintStart?.()
                  onCellAction?.(cell.x, cell.y)
                }}
                onClick={() => {
                  if (canEditCells) return
                  if (cell.bead) onSelectCode(cell.bead.code)
                }}
                className={cn(
                  'relative box-border shrink-0 font-mono leading-none',
                  fill && 'z-10',
                  canEditCells ? 'cursor-crosshair' : cell.bead && 'cursor-pointer',
                  isDimmedBySelection && 'opacity-85 saturate-[0.92]',
                  !fill &&
                    'bg-[repeating-conic-gradient(#ddd8d2_0%_25%,#e8e4df_0%_50%)] bg-[length:8px_8px]',
                  hovered?.x === cell.x &&
                    hovered?.y === cell.y &&
                    'z-10 outline outline-1 -outline-offset-1 outline-[#34205f]/45',
                  cell.bead &&
                    selectedCode === cell.bead.code &&
                    'z-10 outline outline-2 -outline-offset-2 outline-[#34205f]/80',
                )}
                style={{
                  width: cellPx,
                  height: cellPx,
                  backgroundColor: fill,
                }}
              >
                {codeLabel && !isComplete && (
                  <span
                    className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center px-0.5 text-center font-bold leading-none"
                    style={{
                      fontSize: beadLabelFontSize(codeLabel, cellPx),
                      color: beadLabelTextColor(lumHex),
                      textShadow: beadLabelTextShadow(lumHex),
                    }}
                  >
                    <span className="block max-w-full truncate">{codeLabel}</span>
                  </span>
                )}
                {isComplete && cellPx >= 10 && (
                  <span className="pointer-events-none absolute inset-0 z-[2] flex items-center justify-center">
                    <Check
                      className="text-white drop-shadow-md"
                      style={{
                        width: Math.max(10, Math.floor(cellPx * 0.55)),
                        height: Math.max(10, Math.floor(cellPx * 0.55)),
                      }}
                      strokeWidth={3}
                      aria-hidden
                    />
                  </span>
                )}
              </div>
            )
          })}
          {gridDisplay.showGridGuidesOnTop
            ? guideColumnLines.map((x) => (
                <span
                  key={`guide-col-${x}`}
                  className={cn('pointer-events-none absolute top-0 w-0.5', guideLineClass)}
                  style={{
                    left: x * cellPx + (x - 0.5) * gap,
                    height: gridPixelHeight,
                  }}
                  aria-hidden
                />
              ))
            : guideColumnLines.flatMap((x) =>
                Array.from({ length: pattern.height }, (_, y) => {
                  const left = pattern.cells[y * pattern.width + x - 1]?.bead
                  const right = pattern.cells[y * pattern.width + x]?.bead
                  if (left || right) return null
                  return (
                    <span
                      key={`guide-col-${x}-${y}`}
                      className={cn('pointer-events-none absolute top-0 w-px', guideLineClass)}
                      style={{
                        left: x * cellPx + (x - 1) * gap,
                        top: y * (cellPx + gap),
                        height: cellPx,
                      }}
                      aria-hidden
                    />
                  )
                }),
              )}
          {gridDisplay.showGridGuidesOnTop
            ? guideRowLines.map((y) => (
                <span
                  key={`guide-row-${y}`}
                  className={cn('pointer-events-none absolute left-0 h-0.5', guideLineClass)}
                  style={{
                    top: y * cellPx + (y - 0.5) * gap,
                    width: gridPixelWidth,
                  }}
                  aria-hidden
                />
              ))
            : guideRowLines.flatMap((y) =>
                Array.from({ length: pattern.width }, (_, x) => {
                  const above = pattern.cells[(y - 1) * pattern.width + x]?.bead
                  const below = pattern.cells[y * pattern.width + x]?.bead
                  if (above || below) return null
                  return (
                    <span
                      key={`guide-row-${y}-${x}`}
                      className={cn('pointer-events-none absolute left-0 h-px', guideLineClass)}
                      style={{
                        left: x * (cellPx + gap),
                        top: y * cellPx + (y - 1) * gap,
                        width: cellPx,
                      }}
                      aria-hidden
                    />
                  )
                }),
              )}
          {boardColumnLines.map((x) => (
            <span
              key={`board-col-${x}`}
              className="pointer-events-none absolute top-0 z-30 w-0.5 bg-white/75"
              style={{
                left: x * cellPx + (x - 0.5) * gap,
                height: gridPixelHeight,
              }}
              aria-hidden
            />
          ))}
          {boardRowLines.map((y) => (
            <span
              key={`board-row-${y}`}
              className="pointer-events-none absolute left-0 z-30 h-0.5 bg-white/75"
              style={{
                top: y * cellPx + (y - 0.5) * gap,
                width: gridPixelWidth,
              }}
              aria-hidden
            />
          ))}
        </div>
        <div
          className="font-mono tabular-nums text-[#6f6280]/70"
          style={{
            display: 'grid',
            gridTemplateRows: `repeat(${pattern.height}, ${cellPx}px)`,
            rowGap: gap,
          }}
          aria-hidden
        >
          {Array.from({ length: pattern.height }, (_, y) => {
            const active = hovered?.y === y
            return (
              <div
                key={`row-right-${y}`}
                className={cn(
                  'flex items-center justify-start pl-1',
                  active && 'font-semibold text-[#34205f]',
                )}
                style={{
                  width: rulerSize,
                  height: cellPx,
                  fontSize: labelSize,
                }}
              >
                {shouldShowRulerLabel(y, pattern.height, rowStep) ? y + 1 : null}
              </div>
            )
          })}
        </div>
      </div>

      <div
        className="font-mono tabular-nums text-[#6f6280]/70"
        style={{
          display: 'grid',
          gridTemplateColumns: `${rulerSize}px repeat(${pattern.width}, ${cellPx}px) ${rulerSize}px`,
          columnGap: gap,
          rowGap: gap,
        }}
        aria-hidden
      >
        <div style={{ width: rulerSize, height: rulerSize }} />
        {Array.from({ length: pattern.width }, (_, x) => {
          const active = hovered?.x === x
          return (
            <div
              key={`col-bottom-${x}`}
              className={cn(
                'flex items-start justify-center',
                active && 'font-semibold text-[#34205f]',
              )}
              style={{
                width: cellPx,
                height: rulerSize,
                fontSize: labelSize,
              }}
            >
              {shouldShowRulerLabel(x, pattern.width, colStep) ? x + 1 : null}
            </div>
          )
        })}
        <div style={{ width: rulerSize, height: rulerSize }} />
      </div>
    </div>
  )
}
