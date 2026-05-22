'use client'

import { Check } from 'lucide-react'

import {
  beadLabelFontSize,
  beadLabelTextColor,
  beadLabelTextShadow,
  cellFillColor,
  cellLabel,
  luminanceHexForCell,
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
}: PatternPreviewGridProps) {
  const cellCount = pattern.width * pattern.height

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
      />
    )
  }

  const rulerSize = rulerBandSize(cellPx)
  const labelSize = rulerFontSize(cellPx)
  const colStep = rulerLabelStep(pattern.width)
  const rowStep = rulerLabelStep(pattern.height)
  const gap = 1

  return (
    <div className="inline-block">
      <div
        className="font-mono tabular-nums text-white/55"
        style={{
          display: 'grid',
          gridTemplateColumns: `${rulerSize}px repeat(${pattern.width}, ${cellPx}px)`,
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
                active && 'font-semibold text-white',
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
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `${rulerSize}px auto`,
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
          {Array.from({ length: pattern.height }, (_, y) => {
            const active = hovered?.y === y
            return (
              <div
                key={`row-${y}`}
                className={cn(
                  'flex items-center justify-end pr-1',
                  active && 'font-semibold text-white',
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
          className="inline-grid gap-px"
          style={{
            gridTemplateColumns: `repeat(${pattern.width}, ${cellPx}px)`,
          }}
          onMouseLeave={() => onHover(null)}
        >
          {pattern.cells.map((cell) => {
            const fill = cellFillColor(cell, usePaletteColors)
            const codeLabel = cellLabel(cell, gridDisplay.label)
            const lumHex = luminanceHexForCell(cell, usePaletteColors)
            const isComplete = Boolean(cell.bead && completedCodes.has(cell.bead.code))

            return (
              <div
                key={`${cell.x}-${cell.y}`}
                title={
                  cell.bead
                    ? `${cell.bead.code} · ${cell.bead.hex} · row ${cell.y + 1}, col ${cell.x + 1}`
                    : undefined
                }
                onMouseEnter={() => onHover({ x: cell.x, y: cell.y })}
                onClick={() => cell.bead && onSelectCode(cell.bead.code)}
                className={cn(
                  'relative box-border shrink-0 font-mono leading-none',
                  cell.bead && 'cursor-pointer',
                  isComplete && 'opacity-50 saturate-[0.35]',
                  !fill &&
                    'bg-[repeating-conic-gradient(#ddd8d2_0%_25%,#e8e4df_0%_50%)] bg-[length:8px_8px]',
                  hovered?.x === cell.x &&
                    hovered?.y === cell.y &&
                    'z-10 ring-2 ring-white ring-offset-1 ring-offset-[#1a1814]',
                  cell.bead &&
                    selectedCode === cell.bead.code &&
                    'z-10 ring-2 ring-[var(--accent)] ring-offset-1 ring-offset-[#1a1814]',
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
        </div>
      </div>
    </div>
  )
}
