import type { BeadColor, BeadPaletteId } from '@/lib/beadPalettes'
import {
  createBeadMatcher,
  deltaE76,
  hexToRgb,
  rgbToLab,
  type BeadMatchMethod,
} from '@/lib/beadColorMatch'
import { isLightHex } from '@/lib/mardColors'
import {
  capBeadGridDimensions,
  MATCH_YIELD_ROW_INTERVAL,
  MAX_BEAD_GRID_EDGE,
  MAX_SOURCE_EDGE_PX,
  resizeImageDataNearest,
  scaleToMaxEdge,
  yieldToMain,
} from '@/lib/patternPerformance'

export type PatternCell = {
  x: number
  y: number
  /** Original pixel colour before palette matching; null when empty. */
  sourceRgb: [number, number, number] | null
  /** null when transparent or treated as background */
  bead: BeadColor | null
}

export type PatternGridDisplay = {
  /** When true, cells use matched palette hex; otherwise original pixel RGB. */
  useMardColors: boolean
  /** Text drawn inside each bead cell. */
  label: 'none' | 'code' | 'hex'
}

export type BeadPattern = {
  width: number
  height: number
  cells: PatternCell[]
  /** MARD code → bead count (filled cells only) */
  counts: Record<string, number>
  uniqueColors: number
  totalBeads: number
  /** Image file dimensions before bead-grid reduction. */
  sourceWidth: number
  sourceHeight: number
  /** File pixels merged into each bead (1 = one file pixel per bead). */
  pixelBlockSize: number
  paletteId: BeadPaletteId
  /** Present when the file or grid was downscaled for performance. */
  importMeta?: BeadPatternImportMeta
}

export type BeadPatternImportMeta = {
  fileWidth: number
  fileHeight: number
  analysisWidth: number
  analysisHeight: number
}

export type PatternFromImageOptions = {
  paletteId: BeadPaletteId
  /** When set, only these palette codes are used for nearest-colour matching. */
  allowedCodes?: ReadonlySet<string> | null
  /** Crop to the bounding box of non-transparent pixels before matching. */
  trimTransparent: boolean
  removeBackground: boolean
  /**
   * How many file pixels form one art pixel / bead.
   * `auto` picks the largest N where the image looks like uniform N×N upscaled blocks.
   */
  pixelBlockSize: number | 'auto'
  /** Algorithm for mapping source RGB to the nearest palette swatch. */
  matchMethod: BeadMatchMethod
  /** sRGB background to treat as empty (default near-black). */
  backgroundRgb?: [number, number, number]
  /** Max ΔE76 from background colour to skip a pixel. */
  backgroundTolerance?: number
  alphaThreshold?: number
}

const DEFAULT_BG: [number, number, number] = [0, 0, 0]

/** Crops to the tight bounding box of pixels at or above `alphaThreshold`. */
export function trimTransparentPixels(
  data: ImageData,
  alphaThreshold = 128,
): ImageData {
  const { width, height, data: pixels } = data
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = pixels[(y * width + x) * 4 + 3]
      if (a >= alphaThreshold) {
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x)
        maxY = Math.max(maxY, y)
      }
    }
  }

  if (maxX < minX || maxY < minY) return data

  const cropW = maxX - minX + 1
  const cropH = maxY - minY + 1
  const cropped = new ImageData(cropW, cropH)

  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const src = ((y + minY) * width + (x + minX)) * 4
      const dst = (y * cropW + x) * 4
      cropped.data[dst] = pixels[src]
      cropped.data[dst + 1] = pixels[src + 1]
      cropped.data[dst + 2] = pixels[src + 2]
      cropped.data[dst + 3] = pixels[src + 3]
    }
  }

  return cropped
}

function readPixel(data: ImageData, x: number, y: number) {
  const i = (y * data.width + x) * 4
  return {
    r: data.data[i],
    g: data.data[i + 1],
    b: data.data[i + 2],
    a: data.data[i + 3],
  }
}

/** True when opaque pixels in the block sit within `tolerance` per channel (export noise). */
function isUniformBlock(
  data: ImageData,
  blockX: number,
  blockY: number,
  blockSize: number,
  alphaThreshold: number,
  tolerance = 6,
): boolean {
  const x0 = blockX * blockSize
  const y0 = blockY * blockSize
  let minR = 255
  let maxR = 0
  let minG = 255
  let maxG = 0
  let minB = 255
  let maxB = 0
  let hasOpaque = false

  for (let dy = 0; dy < blockSize; dy++) {
    for (let dx = 0; dx < blockSize; dx++) {
      const p = readPixel(data, x0 + dx, y0 + dy)
      if (p.a < alphaThreshold) continue
      hasOpaque = true
      minR = Math.min(minR, p.r)
      maxR = Math.max(maxR, p.r)
      minG = Math.min(minG, p.g)
      maxG = Math.max(maxG, p.g)
      minB = Math.min(minB, p.b)
      maxB = Math.max(maxB, p.b)
    }
  }

  if (!hasOpaque) return true

  return (
    maxR - minR <= tolerance &&
    maxG - minG <= tolerance &&
    maxB - minB <= tolerance
  )
}

function blockUniformityFraction(
  data: ImageData,
  blockSize: number,
  alphaThreshold: number,
  tolerance = 6,
): number {
  const blocksX = data.width / blockSize
  const blocksY = data.height / blockSize
  let uniform = 0

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      if (isUniformBlock(data, bx, by, blockSize, alphaThreshold, tolerance)) uniform++
    }
  }

  return uniform / (blocksX * blocksY)
}

/** Factors that evenly divide width and height, largest first. */
function dividingBlockFactors(width: number, height: number, maxFactor = 32): number[] {
  const limit = Math.min(maxFactor, Math.floor(Math.min(width, height) / 2))
  const factors: number[] = []
  for (let f = limit; f >= 2; f--) {
    if (width % f === 0 && height % f === 0) factors.push(f)
  }
  return factors
}

/**
 * Detects upscaled pixel art (e.g. each 18×18 sprite pixel drawn as 3×3 file pixels).
 * Returns the largest block size where ≥94% of blocks are colour-uniform.
 */
export function detectPixelBlockSize(
  data: ImageData,
  alphaThreshold = 128,
  uniformityThreshold = 0.88,
  colorTolerance = 6,
): number {
  const factors = dividingBlockFactors(data.width, data.height)

  for (const factor of factors) {
    if (
      blockUniformityFraction(data, factor, alphaThreshold, colorTolerance) >=
      uniformityThreshold
    ) {
      return factor
    }
  }

  // Fallback: pick the largest factor with a strong score (handles borderline sprites).
  let bestFactor = 1
  let bestScore = 0
  for (const factor of factors) {
    const score = blockUniformityFraction(data, factor, alphaThreshold, colorTolerance)
    if (score > bestScore) {
      bestScore = score
      bestFactor = factor
    }
  }

  return bestScore >= 0.85 ? bestFactor : 1
}

/** All block sizes that pass the uniformity test (for UI hints). */
export function listDetectedBlockSizes(
  data: ImageData,
  alphaThreshold = 128,
  uniformityThreshold = 0.88,
  colorTolerance = 6,
): number[] {
  return dividingBlockFactors(data.width, data.height).filter(
    (factor) =>
      blockUniformityFraction(data, factor, alphaThreshold, colorTolerance) >=
      uniformityThreshold,
  )
}

function resolvePixelBlockSize(
  full: ImageData,
  trimmed: ImageData,
  choice: number | 'auto',
  alphaThreshold: number,
): number {
  if (choice !== 'auto') return Math.max(1, Math.floor(choice))

  // Prefer detection on the full file so trim does not break divisibility (e.g. 54→52).
  const onFull = detectPixelBlockSize(full, alphaThreshold)
  if (
    onFull > 1 &&
    trimmed.width % onFull === 0 &&
    trimmed.height % onFull === 0
  ) {
    return onFull
  }

  return detectPixelBlockSize(trimmed, alphaThreshold)
}

function sampleBlockPixel(
  data: ImageData,
  blockX: number,
  blockY: number,
  blockSize: number,
  alphaThreshold: number,
): { r: number; g: number; b: number; a: number } {
  const x0 = blockX * blockSize
  const y0 = blockY * blockSize
  const tallies = new Map<string, { r: number; g: number; b: number; a: number; n: number }>()

  for (let dy = 0; dy < blockSize; dy++) {
    for (let dx = 0; dx < blockSize; dx++) {
      const p = readPixel(data, x0 + dx, y0 + dy)
      if (p.a < alphaThreshold) continue
      const key = `${p.r},${p.g},${p.b},${p.a}`
      const prev = tallies.get(key)
      if (prev) prev.n++
      else tallies.set(key, { ...p, n: 1 })
    }
  }

  if (tallies.size === 0) {
    return { r: 0, g: 0, b: 0, a: 0 }
  }

  let best = { r: 0, g: 0, b: 0, a: 0, n: 0 }
  for (const entry of tallies.values()) {
    if (entry.n > best.n) best = entry
  }

  return { r: best.r, g: best.g, b: best.b, a: best.a }
}

/** Collapse each `blockSize`×`blockSize` file-pixel block into one output pixel. */
export function downsampleUniformBlocks(
  data: ImageData,
  blockSize: number,
  alphaThreshold = 128,
): ImageData {
  if (blockSize <= 1) return data

  const outW = data.width / blockSize
  const outH = data.height / blockSize
  const out = new ImageData(outW, outH)

  for (let by = 0; by < outH; by++) {
    for (let bx = 0; bx < outW; bx++) {
      const p = sampleBlockPixel(data, bx, by, blockSize, alphaThreshold)
      const dst = (by * outW + bx) * 4
      out.data[dst] = p.r
      out.data[dst + 1] = p.g
      out.data[dst + 2] = p.b
      out.data[dst + 3] = p.a
    }
  }

  return out
}

export async function patternFromImageData(
  data: ImageData,
  options: PatternFromImageOptions,
): Promise<BeadPattern> {
  const {
    removeBackground,
    backgroundRgb = DEFAULT_BG,
    backgroundTolerance = 12,
    alphaThreshold = 128,
  } = options

  const matcher = createBeadMatcher(
    options.paletteId,
    options.matchMethod,
    options.allowedCodes,
  )
  const bgLab = rgbToLab(...backgroundRgb)
  const { width, height } = data
  const cellCount = width * height
  const cells: PatternCell[] = new Array(cellCount)
  const counts: Record<string, number> = {}
  let totalBeads = 0

  for (let y = 0; y < height; y++) {
    if (y > 0 && y % MATCH_YIELD_ROW_INTERVAL === 0) {
      await yieldToMain()
    }

    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const r = data.data[i]
      const g = data.data[i + 1]
      const b = data.data[i + 2]
      const a = data.data[i + 3]

      let bead: BeadColor | null = null
      let sourceRgb: [number, number, number] | null = null

      if (a >= alphaThreshold) {
        const isBg =
          removeBackground &&
          deltaE76(rgbToLab(r, g, b), bgLab) <= backgroundTolerance

        if (!isBg) {
          sourceRgb = [r, g, b]
          bead = matcher.match(r, g, b)
          counts[bead.code] = (counts[bead.code] ?? 0) + 1
          totalBeads++
        }
      }

      cells[y * width + x] = { x, y, sourceRgb, bead }
    }
  }

  return {
    width,
    height,
    cells,
    counts,
    uniqueColors: Object.keys(counts).length,
    totalBeads,
    sourceWidth: width,
    sourceHeight: height,
    pixelBlockSize: 1,
    paletteId: options.paletteId,
  }
}

export async function patternFromImageFile(
  file: File,
  options: PatternFromImageOptions,
): Promise<BeadPattern> {
  const alphaThreshold = options.alphaThreshold ?? 128
  let bitmap = await createImageBitmap(file)
  const fileWidth = bitmap.width
  const fileHeight = bitmap.height

  const fileFit = scaleToMaxEdge(fileWidth, fileHeight, MAX_SOURCE_EDGE_PX)
  if (fileFit.scale !== 1) {
    const resized = await createImageBitmap(bitmap, {
      resizeWidth: fileFit.width,
      resizeHeight: fileFit.height,
      resizeQuality: 'pixelated',
    })
    bitmap.close()
    bitmap = resized
  }

  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas not supported')

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const sourceWidth = canvas.width
  const sourceHeight = canvas.height
  const fullImageData = ctx.getImageData(0, 0, sourceWidth, sourceHeight)
  const trimmedImageData = options.trimTransparent
    ? trimTransparentPixels(fullImageData, alphaThreshold)
    : fullImageData

  const pixelBlockSize = resolvePixelBlockSize(
    fullImageData,
    trimmedImageData,
    options.pixelBlockSize,
    alphaThreshold,
  )

  let imageData = trimmedImageData
  if (pixelBlockSize > 1) {
    imageData = downsampleUniformBlocks(imageData, pixelBlockSize, alphaThreshold)
  }

  const gridCap = capBeadGridDimensions(imageData.width, imageData.height, MAX_BEAD_GRID_EDGE)
  if (gridCap.scale !== 1) {
    imageData = resizeImageDataNearest(imageData, gridCap.width, gridCap.height)
  }

  const pattern = await patternFromImageData(imageData, options)
  const importMeta: BeadPatternImportMeta = {
    fileWidth,
    fileHeight,
    analysisWidth: imageData.width,
    analysisHeight: imageData.height,
  }

  return {
    ...pattern,
    sourceWidth,
    sourceHeight,
    pixelBlockSize,
    importMeta: fileFit.scale !== 1 || gridCap.scale !== 1 ? importMeta : undefined,
  }
}

export function cellFillColor(
  cell: PatternCell,
  useMardColors: boolean,
): string | undefined {
  if (useMardColors) return cell.bead?.hex
  if (!cell.sourceRgb) return undefined
  const [r, g, b] = cell.sourceRgb
  return `rgb(${r}, ${g}, ${b})`
}

export function cellLabel(cell: PatternCell, label: PatternGridDisplay['label']): string | null {
  if (!cell.bead || label === 'none') return null
  if (label === 'code') return cell.bead.code
  return cell.bead.hex
}

/** Hex used to pick contrasting label colour on a cell. */
export function luminanceHexForCell(
  cell: PatternCell,
  usePaletteColors: boolean,
): string {
  if (usePaletteColors && cell.bead) return cell.bead.hex
  if (cell.sourceRgb) {
    const [r, g, b] = cell.sourceRgb
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  }
  return '#888888'
}

export function beadLabelFontSize(code: string, cellPx: number): number {
  const base = Math.floor(cellPx * 0.42)
  if (code.length <= 5) return Math.max(6, base)
  if (code.length <= 10) return Math.max(5, Math.floor(cellPx * 0.32))
  return Math.max(4, Math.floor(cellPx * 0.22))
}

export function beadLabelTextColor(lumHex: string): string {
  return isLightHex(lumHex) ? '#1a1814' : '#faf8f5'
}

export function beadLabelTextShadow(lumHex: string): string {
  return isLightHex(lumHex)
    ? '0 0 2px rgba(255,255,255,0.9), 0 1px 1px rgba(0,0,0,0.25)'
    : '0 0 2px rgba(0,0,0,0.65), 0 1px 1px rgba(255,255,255,0.2)'
}

export type PatternGridDrawOptions = {
  display: PatternGridDisplay
  usePaletteColors: boolean
  completedCodes?: ReadonlySet<string>
  hovered?: { x: number; y: number } | null
  selectedCode?: string | null
}

export function drawPatternGrid(
  ctx: CanvasRenderingContext2D,
  pattern: BeadPattern,
  cellPx: number,
  options: PatternGridDrawOptions,
): void {
  const { display, usePaletteColors, completedCodes, hovered, selectedCode } = options

  for (const cell of pattern.cells) {
    const px = cell.x * cellPx
    const py = cell.y * cellPx
    const isComplete = Boolean(cell.bead && completedCodes?.has(cell.bead.code))
    const fill = cellFillColor(cell, display.useMardColors)

    if (!fill) {
      ctx.fillStyle = (cell.x + cell.y) % 2 === 0 ? '#e8e4df' : '#ddd8d2'
      ctx.fillRect(px, py, cellPx, cellPx)
      continue
    }

    ctx.fillStyle = fill
    ctx.fillRect(px, py, cellPx, cellPx)

    if (isComplete) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)'
      ctx.fillRect(px, py, cellPx, cellPx)
    }

    const text = isComplete ? null : cellLabel(cell, display.label)
    if (text) {
      const lumHex = luminanceHexForCell(cell, usePaletteColors)
      ctx.fillStyle = beadLabelTextColor(lumHex)
      ctx.font = `bold ${beadLabelFontSize(text, cellPx)}px ui-monospace, monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      const maxWidth = cellPx - 2
      if (ctx.measureText(text).width > maxWidth && text.length > 4) {
        let clipped = text
        while (clipped.length > 2 && ctx.measureText(`${clipped}…`).width > maxWidth) {
          clipped = clipped.slice(0, -1)
        }
        ctx.fillText(`${clipped}…`, px + cellPx / 2, py + cellPx / 2)
      } else {
        ctx.fillText(text, px + cellPx / 2, py + cellPx / 2)
      }
    }

    if (isComplete && cellPx >= 10) {
      const size = Math.max(10, Math.floor(cellPx * 0.5))
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = Math.max(2, Math.floor(cellPx * 0.12))
      ctx.beginPath()
      ctx.moveTo(px + cellPx * 0.28, py + cellPx * 0.55)
      ctx.lineTo(px + cellPx * 0.42, py + cellPx * 0.7)
      ctx.lineTo(px + cellPx * 0.75, py + cellPx * 0.32)
      ctx.stroke()
    }
  }

  if (hovered) {
    const hx = hovered.x * cellPx
    const hy = hovered.y * cellPx
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2
    ctx.strokeRect(hx + 1, hy + 1, cellPx - 2, cellPx - 2)
  }

  if (selectedCode) {
    for (const cell of pattern.cells) {
      if (cell.bead?.code !== selectedCode) continue
      const px = cell.x * cellPx
      const py = cell.y * cellPx
      ctx.strokeStyle = '#e85d04'
      ctx.lineWidth = 2
      ctx.strokeRect(px + 1, py + 1, cellPx - 2, cellPx - 2)
    }
  }
}

export function renderPatternToCanvas(
  pattern: BeadPattern,
  cellPx: number,
  display: PatternGridDisplay,
): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = pattern.width * cellPx
  canvas.height = pattern.height * cellPx
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')

  drawPatternGrid(ctx, pattern, cellPx, {
    display,
    usePaletteColors: display.useMardColors,
  })

  return canvas
}
