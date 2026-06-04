import {
  BEAD_PALETTES,
  getBeadColor,
  type BeadColor,
  type BeadPaletteId,
} from '@/lib/beadPalettes'
import {
  createBeadMatcher,
  deltaE76,
  hexToRgb,
  rgbToLab,
  type BeadMatchMethod,
} from '@/lib/beadColorMatch'
import { isLightHex } from '@/lib/mardColors'
import {
  rulerBandSize,
  rulerFontSize,
  rulerLabelStep,
  shouldShowRulerLabel,
} from '@/lib/patternRuler'
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
  /** Optional pegboard size used to draw board boundaries. */
  boardSize?: number | null
  /** When true, 5-bead guide lines are drawn above the design. */
  showGridGuidesOnTop?: boolean
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
  /** Auto-detected bead-grid size before manual width resampling or board padding. */
  naturalWidth?: number
  naturalHeight?: number
  /** Filled design footprint before pegboard padding. */
  designWidth?: number
  designHeight?: number
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

export type PegboardAnchor =
  | 'top-left'
  | 'top-center'
  | 'top-right'
  | 'middle-left'
  | 'center'
  | 'middle-right'
  | 'bottom-left'
  | 'bottom-center'
  | 'bottom-right'

function pegboardOffset(
  available: number,
  axis: 'x' | 'y',
  anchor: PegboardAnchor,
): number {
  if (
    (axis === 'x' && (anchor === 'top-center' || anchor === 'center' || anchor === 'bottom-center')) ||
    (axis === 'y' && (anchor === 'middle-left' || anchor === 'center' || anchor === 'middle-right'))
  ) {
    return Math.floor(available / 2)
  }
  if (axis === 'x' && anchor.endsWith('right')) return available
  if (axis === 'y' && anchor.startsWith('bottom')) return available
  return 0
}

export function fitPatternToPegboards(
  pattern: BeadPattern,
  boardSize: number,
  anchor: PegboardAnchor = 'top-left',
): BeadPattern {
  const size = Math.max(1, Math.floor(boardSize))
  const width = Math.ceil(pattern.width / size) * size
  const height = Math.ceil(pattern.height / size) * size

  if (width === pattern.width && height === pattern.height) {
    return {
      ...pattern,
      designWidth: pattern.designWidth ?? pattern.width,
      designHeight: pattern.designHeight ?? pattern.height,
    }
  }

  const offsetX = pegboardOffset(width - pattern.width, 'x', anchor)
  const offsetY = pegboardOffset(height - pattern.height, 'y', anchor)
  const cells: PatternCell[] = Array.from({ length: width * height }, (_, i) => ({
    x: i % width,
    y: Math.floor(i / width),
    sourceRgb: null,
    bead: null,
  }))

  for (const cell of pattern.cells) {
    const x = cell.x + offsetX
    const y = cell.y + offsetY
    cells[y * width + x] = { ...cell, x, y }
  }

  return {
    ...pattern,
    width,
    height,
    cells,
    designWidth: pattern.designWidth ?? pattern.width,
    designHeight: pattern.designHeight ?? pattern.height,
  }
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
  /**
   * Resample trimmed image to this many bead columns (height from aspect ratio).
   * Overrides block-size downsampling when set.
   */
  targetCanvasWidth?: number | null
  /** Cap unique bead colours after matching; remaps rare colours to nearest kept. */
  paletteLimit?: number | null
  /** Use dominant-colour sampling when resampling to target grid. */
  dominantSampling?: boolean
  /** Algorithm for mapping source RGB to the nearest palette swatch. */
  matchMethod: BeadMatchMethod
  /** Optional sRGB background hint to treat as empty when connected to an image edge. */
  backgroundRgb?: [number, number, number]
  /** RGB distance tolerance for edge-connected background cleanup. */
  backgroundTolerance?: number
  alphaThreshold?: number
}

function cloneImageData(data: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(data.data), data.width, data.height)
}

function rgbDistanceSq(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

function collectLikelyEdgeBackgrounds(
  data: ImageData,
  alphaThreshold: number,
  explicitBg?: [number, number, number],
): [number, number, number][] {
  if (explicitBg) return [explicitBg]

  const buckets = new Map<string, { rgb: [number, number, number]; count: number }>()
  const add = (x: number, y: number) => {
    const i = (y * data.width + x) * 4
    if (data.data[i + 3] < alphaThreshold) return
    const rgb: [number, number, number] = [data.data[i], data.data[i + 1], data.data[i + 2]]
    const key = rgb.map((v) => Math.round(v / 16) * 16).join(',')
    const bucket = buckets.get(key)
    if (bucket) bucket.count++
    else buckets.set(key, { rgb, count: 1 })
  }

  for (let x = 0; x < data.width; x++) {
    add(x, 0)
    add(x, data.height - 1)
  }
  for (let y = 1; y < data.height - 1; y++) {
    add(0, y)
    add(data.width - 1, y)
  }

  return [...buckets.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((bucket) => bucket.rgb)
}

function isNearAnyBackground(
  rgb: [number, number, number],
  backgrounds: readonly [number, number, number][],
  tolerance: number,
): boolean {
  const threshold = tolerance * tolerance
  return backgrounds.some((bg) => rgbDistanceSq(rgb, bg) <= threshold)
}

function removeConnectedEdgeBackground(
  data: ImageData,
  alphaThreshold: number,
  tolerance = 36,
  explicitBg?: [number, number, number],
): ImageData {
  const backgrounds = collectLikelyEdgeBackgrounds(data, alphaThreshold, explicitBg)
  if (backgrounds.length === 0) return data

  const out = cloneImageData(data)
  const visited = new Uint8Array(data.width * data.height)
  const queue: number[] = []

  const maybeEnqueue = (x: number, y: number) => {
    const idx = y * data.width + x
    if (visited[idx]) return
    const i = idx * 4
    if (out.data[i + 3] < alphaThreshold) return
    const rgb: [number, number, number] = [out.data[i], out.data[i + 1], out.data[i + 2]]
    if (!isNearAnyBackground(rgb, backgrounds, tolerance)) return
    visited[idx] = 1
    queue.push(idx)
  }

  for (let x = 0; x < data.width; x++) {
    maybeEnqueue(x, 0)
    maybeEnqueue(x, data.height - 1)
  }
  for (let y = 1; y < data.height - 1; y++) {
    maybeEnqueue(0, y)
    maybeEnqueue(data.width - 1, y)
  }

  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head]
    const x = idx % data.width
    const y = Math.floor(idx / data.width)
    out.data[idx * 4 + 3] = 0
    if (x > 0) maybeEnqueue(x - 1, y)
    if (x < data.width - 1) maybeEnqueue(x + 1, y)
    if (y > 0) maybeEnqueue(x, y - 1)
    if (y < data.height - 1) maybeEnqueue(x, y + 1)
  }

  return out
}

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

/** Resample source image to a fixed bead grid width; height from aspect ratio. */
export function downsampleToTargetWidth(
  data: ImageData,
  targetWidth: number,
  alphaThreshold = 128,
  dominant = true,
): ImageData {
  const tw = Math.max(1, Math.min(data.width, Math.floor(targetWidth)))
  const th = Math.max(1, Math.round((data.height / data.width) * tw))
  const out = new ImageData(tw, th)

  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor((x / tw) * data.width)
      const x1 = Math.floor(((x + 1) / tw) * data.width)
      const y0 = Math.floor((y / th) * data.height)
      const y1 = Math.floor(((y + 1) / th) * data.height)

      const tallies = new Map<string, { r: number; g: number; b: number; a: number; n: number }>()
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const p = readPixel(data, sx, sy)
          if (p.a < alphaThreshold) continue
          const key = `${p.r},${p.g},${p.b},${p.a}`
          const prev = tallies.get(key)
          if (prev) prev.n++
          else tallies.set(key, { ...p, n: 1 })
        }
      }

      const dst = (y * tw + x) * 4
      if (tallies.size === 0) {
        out.data[dst + 3] = 0
        continue
      }

      let best = { r: 0, g: 0, b: 0, a: 0, n: 0 }
      if (dominant) {
        for (const entry of tallies.values()) {
          if (entry.n > best.n) best = entry
        }
      } else {
        let r = 0
        let g = 0
        let b = 0
        let a = 0
        let n = 0
        for (const entry of tallies.values()) {
          r += entry.r * entry.n
          g += entry.g * entry.n
          b += entry.b * entry.n
          a += entry.a * entry.n
          n += entry.n
        }
        best = {
          r: Math.round(r / n),
          g: Math.round(g / n),
          b: Math.round(b / n),
          a: Math.round(a / n),
          n,
        }
      }

      out.data[dst] = best.r
      out.data[dst + 1] = best.g
      out.data[dst + 2] = best.b
      out.data[dst + 3] = best.a
    }
  }

  return out
}

/** Keep top N colours by bead count; remap others to nearest kept code. */
export function applyPaletteLimit(
  pattern: BeadPattern,
  limit: number,
  paletteId: BeadPaletteId,
): BeadPattern {
  const cap = Math.max(1, Math.floor(limit))
  const used = Object.entries(pattern.counts).sort((a, b) => b[1] - a[1])
  if (used.length <= cap) return pattern

  const kept = new Set(used.slice(0, cap).map(([code]) => code))
  const keptList = [...kept]
  const keptLabs = keptList.map((code) => {
    const bead = getBeadColor(paletteId, code)
    return bead ? rgbToLab(...hexToRgb(bead.hex)) : ([0, 0, 0] as const)
  })

  function nearestKept(code: string): string {
    if (kept.has(code)) return code
    const bead = getBeadColor(paletteId, code)
    if (!bead) return keptList[0]
    const lab = rgbToLab(...hexToRgb(bead.hex))
    let bestCode = keptList[0]
    let bestDist = Infinity
    keptList.forEach((k, i) => {
      const dist = deltaE76(lab, keptLabs[i])
      if (dist < bestDist) {
        bestDist = dist
        bestCode = k
      }
    })
    return bestCode
  }

  const remap = new Map<string, string>()
  for (const [code] of used) {
    if (!kept.has(code)) remap.set(code, nearestKept(code))
  }

  const cells = pattern.cells.map((cell) => {
    if (!cell.bead) return cell
    const nextCode = remap.get(cell.bead.code)
    if (!nextCode) return cell
    const bead = getBeadColor(paletteId, nextCode)
    return bead ? { ...cell, bead } : cell
  })

  const counts: Record<string, number> = {}
  let totalBeads = 0
  for (const cell of cells) {
    if (!cell.bead) continue
    counts[cell.bead.code] = (counts[cell.bead.code] ?? 0) + 1
    totalBeads++
  }

  return {
    ...pattern,
    cells,
    counts,
    uniqueColors: Object.keys(counts).length,
    totalBeads,
  }
}

export async function patternFromImageData(
  data: ImageData,
  options: PatternFromImageOptions,
): Promise<BeadPattern> {
  const {
    alphaThreshold = 128,
  } = options

  const matcher = createBeadMatcher(
    options.paletteId,
    options.matchMethod,
    options.allowedCodes,
  )
  const { width, height } = data
  const cellCount = width * height
  const cells: PatternCell[] = new Array(cellCount)
  const counts: Record<string, number> = {}
  let totalBeads = 0
  let minBeadX = width
  let minBeadY = height
  let maxBeadX = -1
  let maxBeadY = -1

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
        sourceRgb = [r, g, b]
        bead = matcher.match(r, g, b)
        counts[bead.code] = (counts[bead.code] ?? 0) + 1
        totalBeads++
        minBeadX = Math.min(minBeadX, x)
        minBeadY = Math.min(minBeadY, y)
        maxBeadX = Math.max(maxBeadX, x)
        maxBeadY = Math.max(maxBeadY, y)
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
    naturalWidth: width,
    naturalHeight: height,
    designWidth: totalBeads > 0 ? maxBeadX - minBeadX + 1 : 0,
    designHeight: totalBeads > 0 ? maxBeadY - minBeadY + 1 : 0,
    paletteId: options.paletteId,
  }
}

export async function patternFromImageFile(
  file: File,
  options: PatternFromImageOptions,
): Promise<BeadPattern> {
  const alphaThreshold = options.alphaThreshold ?? 128
  let fileWidth = 0
  let fileHeight = 0
  let fileFit = scaleToMaxEdge(1, 1, MAX_SOURCE_EDGE_PX)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Canvas not supported')

  let drawn = false
  const drawHtmlImage = (image: HTMLImageElement) => {
    fileWidth = image.naturalWidth
    fileHeight = image.naturalHeight
    fileFit = scaleToMaxEdge(fileWidth, fileHeight, MAX_SOURCE_EDGE_PX)
    canvas.width = fileFit.width
    canvas.height = fileFit.height
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
  }
  const loadHtmlImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Image decode failed'))
      img.src = src
    })
  if (typeof createImageBitmap === 'function') {
    try {
      let bitmap = await createImageBitmap(file)
      fileWidth = bitmap.width
      fileHeight = bitmap.height

      fileFit = scaleToMaxEdge(fileWidth, fileHeight, MAX_SOURCE_EDGE_PX)
      if (fileFit.scale !== 1) {
        const resized = await createImageBitmap(bitmap, {
          resizeWidth: fileFit.width,
          resizeHeight: fileFit.height,
          resizeQuality: 'pixelated',
        })
        bitmap.close()
        bitmap = resized
      }

      canvas.width = bitmap.width
      canvas.height = bitmap.height
      ctx.imageSmoothingEnabled = false
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(bitmap, 0, 0)
      bitmap.close()
      drawn = true
    } catch {
      drawn = false
    }
  }

  if (!drawn) {
    let objectUrlDecodeError: unknown = null
    const url = URL.createObjectURL(file)
    try {
      drawHtmlImage(await loadHtmlImage(url))
      drawn = true
    } catch (err) {
      objectUrlDecodeError = err
    } finally {
      URL.revokeObjectURL(url)
    }

    if (!drawn) {
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(String(reader.result))
          reader.onerror = () => reject(reader.error ?? new Error('File read failed'))
          reader.readAsDataURL(file)
        })
        drawHtmlImage(await loadHtmlImage(dataUrl))
        drawn = true
      } catch (err) {
        throw objectUrlDecodeError instanceof Error ? objectUrlDecodeError : err
      }
    }
  }

  const sourceWidth = canvas.width
  const sourceHeight = canvas.height
  const fullImageData = ctx.getImageData(0, 0, sourceWidth, sourceHeight)
  const backgroundCleanedImageData = options.removeBackground
    ? removeConnectedEdgeBackground(
        fullImageData,
        alphaThreshold,
        options.backgroundTolerance ?? 36,
        options.backgroundRgb,
      )
    : fullImageData
  const trimmedImageData = options.trimTransparent
    ? trimTransparentPixels(backgroundCleanedImageData, alphaThreshold)
    : backgroundCleanedImageData

  const naturalPixelBlockSize = resolvePixelBlockSize(
    fullImageData,
    trimmedImageData,
    options.pixelBlockSize,
    alphaThreshold,
  )
  let naturalImageData = trimmedImageData
  if (naturalPixelBlockSize > 1) {
    naturalImageData = downsampleUniformBlocks(
      naturalImageData,
      naturalPixelBlockSize,
      alphaThreshold,
    )
  }

  let pixelBlockSize = naturalPixelBlockSize
  let imageData = naturalImageData

  if (options.targetCanvasWidth && options.targetCanvasWidth > 0) {
    const targetWidth = Math.min(options.targetCanvasWidth, naturalImageData.width)
    imageData =
      targetWidth === naturalImageData.width
        ? naturalImageData
        : downsampleToTargetWidth(
            naturalImageData,
            targetWidth,
            alphaThreshold,
            options.dominantSampling !== false,
          )
    pixelBlockSize = Math.max(
      1,
      Math.round(trimmedImageData.width / imageData.width),
    )
  }

  const gridCap = capBeadGridDimensions(imageData.width, imageData.height, MAX_BEAD_GRID_EDGE)
  if (gridCap.scale !== 1) {
    imageData = resizeImageDataNearest(imageData, gridCap.width, gridCap.height)
  }

  let pattern = await patternFromImageData(imageData, options)
  if (options.paletteLimit && options.paletteLimit > 0) {
    pattern = applyPaletteLimit(pattern, options.paletteLimit, options.paletteId)
  }
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
    naturalWidth: naturalImageData.width,
    naturalHeight: naturalImageData.height,
    designWidth: pattern.designWidth ?? pattern.width,
    designHeight: pattern.designHeight ?? pattern.height,
    importMeta: fileFit.scale !== 1 || gridCap.scale !== 1 ? importMeta : undefined,
  }
}

/** True when edits changed the matched bead vs the generated base pattern. */
export function cellBeadChangedFromBase(
  cell: PatternCell,
  baseCell: PatternCell | undefined,
): boolean {
  if (!baseCell) return false
  return (baseCell.bead?.code ?? null) !== (cell.bead?.code ?? null)
}

export function cellFillColor(
  cell: PatternCell,
  useMardColors: boolean,
  baseCell?: PatternCell,
): string | undefined {
  const showBeadColor =
    useMardColors || (baseCell !== undefined && cellBeadChangedFromBase(cell, baseCell))
  if (showBeadColor) return cell.bead?.hex
  if (cell.sourceRgb) {
    const [r, g, b] = cell.sourceRgb
    return `rgb(${r}, ${g}, ${b})`
  }
  return cell.bead?.hex
}

function displayBeadCode(code: string): string {
  for (const palette of BEAD_PALETTES) {
    const prefix = `${palette.label} `
    if (code.startsWith(prefix)) return code.slice(prefix.length)
  }
  return code
}

export function cellLabel(cell: PatternCell, label: PatternGridDisplay['label']): string | null {
  if (!cell.bead || label === 'none') return null
  if (label === 'code') return displayBeadCode(cell.bead.code)
  return cell.bead.hex
}

/** Hex used to pick contrasting label colour on a cell. */
export function luminanceHexForCell(
  cell: PatternCell,
  usePaletteColors: boolean,
  baseCell?: PatternCell,
): string {
  const showBeadColor =
    usePaletteColors ||
    (baseCell !== undefined && cellBeadChangedFromBase(cell, baseCell))
  if (showBeadColor && cell.bead) return cell.bead.hex
  if (cell.sourceRgb) {
    const [r, g, b] = cell.sourceRgb
    return `#${[r, g, b].map((c) => c.toString(16).padStart(2, '0')).join('')}`
  }
  return '#888888'
}

export function beadLabelFontSize(code: string, cellPx: number): number {
  const base = Math.floor(cellPx * 0.42)
  if (code.length <= 5) return Math.max(4, base)
  if (code.length <= 10) return Math.max(3, Math.floor(cellPx * 0.32))
  return Math.max(3, Math.floor(cellPx * 0.22))
}

export const MIN_READABLE_LABEL_CELL_PX = 10

export function shouldDrawCellLabel(label: PatternGridDisplay['label'], cellPx: number): boolean {
  return label !== 'none' && cellPx >= MIN_READABLE_LABEL_CELL_PX
}

export function beadLabelTextColor(lumHex: string): string {
  return isLightHex(lumHex) ? '#1a1814' : '#faf8f5'
}

export function beadLabelTextShadow(lumHex: string): string {
  return isLightHex(lumHex)
    ? '0 0 2px rgba(255,255,255,0.9), 0 1px 1px rgba(0,0,0,0.25)'
    : '0 0 2px rgba(0,0,0,0.65), 0 1px 1px rgba(255,255,255,0.2)'
}

export function beadHighlightStrokeColor(lumHex: string, alpha = 0.88): string {
  return isLightHex(lumHex)
    ? `rgba(20,20,20,${alpha})`
    : `rgba(255,255,255,${alpha})`
}

export type PatternGridDrawOptions = {
  display: PatternGridDisplay
  usePaletteColors: boolean
  /** When comparing to source colours, still show bead fill on edited cells. */
  basePattern?: BeadPattern | null
  completedCodes?: ReadonlySet<string>
  hovered?: { x: number; y: number } | null
  selectedCode?: string | null
}

const GUIDE_GRID_STEP = 5

function drawGuideGridLines(
  ctx: CanvasRenderingContext2D,
  pattern: BeadPattern,
  cellPx: number,
  onTop: boolean,
): void {
  if (!onTop) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.58)'
    ctx.lineWidth = Math.max(1, Math.floor(cellPx * 0.05))

    for (let x = GUIDE_GRID_STEP; x < pattern.width; x += GUIDE_GRID_STEP) {
      for (let y = 0; y < pattern.height; y++) {
        const left = pattern.cells[y * pattern.width + x - 1]?.bead
        const right = pattern.cells[y * pattern.width + x]?.bead
        if (left || right) continue
        const px = x * cellPx
        const py = y * cellPx
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px, py + cellPx)
        ctx.stroke()
      }
    }

    for (let y = GUIDE_GRID_STEP; y < pattern.height; y += GUIDE_GRID_STEP) {
      for (let x = 0; x < pattern.width; x++) {
        const above = pattern.cells[(y - 1) * pattern.width + x]?.bead
        const below = pattern.cells[y * pattern.width + x]?.bead
        if (above || below) continue
        const px = x * cellPx
        const py = y * cellPx
        ctx.beginPath()
        ctx.moveTo(px, py)
        ctx.lineTo(px + cellPx, py)
        ctx.stroke()
      }
    }

    ctx.restore()
    return
  }

  const lines: Array<{ strokeStyle: string; lineWidth: number }> = onTop
    ? [
        { strokeStyle: 'rgba(20,20,20,0.28)', lineWidth: Math.max(2, Math.floor(cellPx * 0.1)) },
        { strokeStyle: 'rgba(255,255,255,0.82)', lineWidth: Math.max(1, Math.floor(cellPx * 0.06)) },
      ]
    : [
        { strokeStyle: 'rgba(20,20,20,0.32)', lineWidth: Math.max(2, Math.floor(cellPx * 0.08)) },
        { strokeStyle: 'rgba(255,255,255,0.58)', lineWidth: Math.max(1, Math.floor(cellPx * 0.05)) },
      ]

  ctx.save()
  for (const line of lines) {
    ctx.strokeStyle = line.strokeStyle
    ctx.lineWidth = line.lineWidth

    for (let x = GUIDE_GRID_STEP; x < pattern.width; x += GUIDE_GRID_STEP) {
      const px = x * cellPx
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, pattern.height * cellPx)
      ctx.stroke()
    }

    for (let y = GUIDE_GRID_STEP; y < pattern.height; y += GUIDE_GRID_STEP) {
      const py = y * cellPx
      ctx.beginPath()
      ctx.moveTo(0, py)
      ctx.lineTo(pattern.width * cellPx, py)
      ctx.stroke()
    }
  }

  ctx.restore()
}

export function drawPatternGrid(
  ctx: CanvasRenderingContext2D,
  pattern: BeadPattern,
  cellPx: number,
  options: PatternGridDrawOptions,
): void {
  const { display, usePaletteColors, basePattern, completedCodes, hovered, selectedCode } =
    options
  const boardSize = display.boardSize && display.boardSize > 0 ? display.boardSize : null
  const showGridGuidesOnTop = Boolean(display.showGridGuidesOnTop)
  const baseCellByKey = basePattern
    ? new Map(basePattern.cells.map((c) => [`${c.x},${c.y}`, c] as const))
    : null
  ctx.clearRect(0, 0, pattern.width * cellPx, pattern.height * cellPx)

  for (const cell of pattern.cells) {
    const px = cell.x * cellPx
    const py = cell.y * cellPx
    const isComplete = Boolean(cell.bead && completedCodes?.has(cell.bead.code))
    const baseCell = baseCellByKey?.get(`${cell.x},${cell.y}`)
    const fill = cellFillColor(cell, display.useMardColors, baseCell)

    if (!fill) {
      ctx.fillStyle = (cell.x + cell.y) % 2 === 0 ? '#e8e4df' : '#ddd8d2'
      ctx.fillRect(px, py, cellPx, cellPx)
      continue
    }

    ctx.fillStyle = fill
    ctx.fillRect(px, py, cellPx, cellPx)

    const text = !isComplete && shouldDrawCellLabel(display.label, cellPx)
      ? cellLabel(cell, display.label)
      : null
    if (text) {
      const lumHex = luminanceHexForCell(cell, usePaletteColors, baseCell)
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

  drawGuideGridLines(ctx, pattern, cellPx, showGridGuidesOnTop)

  if (boardSize) {
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.72)'
    ctx.lineWidth = Math.max(2, Math.floor(cellPx * 0.12))
    for (let x = boardSize; x < pattern.width; x += boardSize) {
      const px = x * cellPx
      ctx.beginPath()
      ctx.moveTo(px, 0)
      ctx.lineTo(px, pattern.height * cellPx)
      ctx.stroke()
    }
    for (let y = boardSize; y < pattern.height; y += boardSize) {
      const py = y * cellPx
      ctx.beginPath()
      ctx.moveTo(0, py)
      ctx.lineTo(pattern.width * cellPx, py)
      ctx.stroke()
    }
    ctx.restore()
  }

  if (hovered) {
    const cell = pattern.cells[hovered.y * pattern.width + hovered.x]
    const baseCell = cell ? baseCellByKey?.get(`${cell.x},${cell.y}`) : undefined
    const lumHex = cell ? luminanceHexForCell(cell, usePaletteColors, baseCell) : '#888888'
    const hx = hovered.x * cellPx
    const hy = hovered.y * cellPx
    ctx.strokeStyle = beadHighlightStrokeColor(lumHex, 0.72)
    ctx.lineWidth = 1
    ctx.strokeRect(hx + 0.5, hy + 0.5, cellPx - 1, cellPx - 1)
  }

  if (selectedCode) {
    for (const cell of pattern.cells) {
      if (cell.bead?.code !== selectedCode) continue
      const px = cell.x * cellPx
      const py = cell.y * cellPx
      const baseCell = baseCellByKey?.get(`${cell.x},${cell.y}`)
      const lumHex = luminanceHexForCell(cell, usePaletteColors, baseCell)
      ctx.strokeStyle = beadHighlightStrokeColor(lumHex)
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

type ExportColorStat = {
  code: string
  count: number
  hex: string
}

const EXPORT_COLOR_CARD_W = 146
const EXPORT_COLOR_CARD_H = 42
const EXPORT_COLOR_CARD_GAP = 8
const EXPORT_COLOR_TITLE_SIZE = 30

const EXPORT_LOGO_SRC = '/poofpixels-logo.webp'
const EXPORT_THEME = {
  background: '#FCF7FB',
  purple: '#4F3A8A',
  deepPurple: '#34205F',
  pink: '#EA7AB8',
  muted: '#6C6178',
} as const
let exportLogoPromise: Promise<HTMLImageElement | null> | null = null

function loadExportLogo(): Promise<HTMLImageElement | null> {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (exportLogoPromise) return exportLogoPromise

  exportLogoPromise = new Promise((resolve) => {
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = EXPORT_LOGO_SRC
  })

  return exportLogoPromise
}

function exportColorStats(pattern: BeadPattern): ExportColorStat[] {
  const hexByCode = new Map<string, string>()
  for (const cell of pattern.cells) {
    if (cell.bead) hexByCode.set(cell.bead.code, cell.bead.hex)
  }

  return Object.entries(pattern.counts)
    .map(([code, count]) => ({
      code,
      count,
      hex: hexByCode.get(code) ?? '#888888',
    }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, undefined, { numeric: true }))
}

function exportCodeParts(code: string): { brand: string | null; code: string } {
  const mixedPrefixes: Array<[string, string]> = [
    ['Artkal Mini · C chart ', 'Artkal Mini'],
    ['Artkal Mini · M chart ', 'Artkal Mini'],
    ['Artkal Mini ', 'Artkal Mini'],
    ['Artkal-C Mini ', 'Artkal Mini'],
    ['Artkal-M Mini ', 'Artkal Mini'],
    ['Hama Midi ', 'Hama'],
    ['IKEA Pyssla ', 'Pyssla'],
    ['MARD ', 'MARD'],
    ['Perler ', 'Perler'],
    ['Artkal-S ', 'Artkal-S'],
    ['Nabbi ', 'Nabbi'],
    ['ZLLBTMO ', 'ZLLBTMO'],
  ]

  for (const [prefix, brand] of mixedPrefixes) {
    if (code.startsWith(prefix)) {
      return { brand, code: code.slice(prefix.length) }
    }
  }

  return { brand: null, code }
}

function drawExportColorBreakdown(
  ctx: CanvasRenderingContext2D,
  stats: ExportColorStat[],
  x: number,
  y: number,
  width: number,
): number {
  const columns = Math.max(
    1,
    Math.floor((width + EXPORT_COLOR_CARD_GAP) / (EXPORT_COLOR_CARD_W + EXPORT_COLOR_CARD_GAP)),
  )

  ctx.fillStyle = EXPORT_THEME.deepPurple
  ctx.font = `800 ${EXPORT_COLOR_TITLE_SIZE}px ui-sans-serif, system-ui, sans-serif`
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillText('Bead Count & Colours', x, y)

  const cardsY = y + EXPORT_COLOR_TITLE_SIZE + 18
  stats.forEach((stat, index) => {
    const col = index % columns
    const row = Math.floor(index / columns)
    const cardX = x + col * (EXPORT_COLOR_CARD_W + EXPORT_COLOR_CARD_GAP)
    const cardY = cardsY + row * (EXPORT_COLOR_CARD_H + EXPORT_COLOR_CARD_GAP)
    const textColor = beadLabelTextColor(stat.hex)
    const { brand, code } = exportCodeParts(stat.code)

    ctx.fillStyle = stat.hex
    ctx.beginPath()
    ctx.roundRect(cardX, cardY, EXPORT_COLOR_CARD_W, EXPORT_COLOR_CARD_H, 7)
    ctx.fill()

    ctx.fillStyle = textColor
    ctx.textAlign = 'left'
    if (brand) {
      ctx.textBaseline = 'top'
      ctx.font = '800 10px ui-sans-serif, system-ui, sans-serif'
      ctx.fillText(brand, cardX + 8, cardY + 5)
      ctx.font = '900 14px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(code, cardX + 8, cardY + 31)
    } else {
      ctx.font = '900 15px ui-monospace, SFMono-Regular, Menlo, monospace'
      ctx.textBaseline = 'middle'
      ctx.fillText(code, cardX + 8, cardY + EXPORT_COLOR_CARD_H / 2)
    }

    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    ctx.font = '900 13px ui-monospace, SFMono-Regular, Menlo, monospace'
    ctx.fillText(String(stat.count), cardX + EXPORT_COLOR_CARD_W - 8, cardY + EXPORT_COLOR_CARD_H / 2)
  })

  const rows = Math.ceil(stats.length / columns)
  return (
    EXPORT_COLOR_TITLE_SIZE +
    18 +
    rows * EXPORT_COLOR_CARD_H +
    Math.max(0, rows - 1) * EXPORT_COLOR_CARD_GAP
  )
}

function drawExportRulers(
  ctx: CanvasRenderingContext2D,
  pattern: BeadPattern,
  cellPx: number,
  x: number,
  y: number,
  rulerSize: number,
): void {
  const gridW = pattern.width * cellPx
  const gridH = pattern.height * cellPx
  const colStep = rulerLabelStep(pattern.width)
  const rowStep = rulerLabelStep(pattern.height)
  const fontSize = rulerFontSize(cellPx)

  ctx.save()
  ctx.fillStyle = '#F4ECF4'
  ctx.fillRect(x, y, rulerSize * 2 + gridW, rulerSize)
  ctx.fillRect(x, y + rulerSize + gridH, rulerSize * 2 + gridW, rulerSize)
  ctx.fillRect(x, y + rulerSize, rulerSize, gridH)
  ctx.fillRect(x + rulerSize + gridW, y + rulerSize, rulerSize, gridH)

  ctx.fillStyle = EXPORT_THEME.deepPurple
  ctx.font = `800 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  for (let col = 0; col < pattern.width; col++) {
    if (!shouldShowRulerLabel(col, pattern.width, colStep)) continue
    const labelX = x + rulerSize + col * cellPx + cellPx / 2
    ctx.fillText(String(col + 1), labelX, y + rulerSize / 2)
    ctx.fillText(String(col + 1), labelX, y + rulerSize + gridH + rulerSize / 2)
  }

  ctx.textAlign = 'right'
  for (let row = 0; row < pattern.height; row++) {
    if (!shouldShowRulerLabel(row, pattern.height, rowStep)) continue
    const labelY = y + rulerSize + row * cellPx + cellPx / 2
    ctx.fillText(String(row + 1), x + rulerSize - 5, labelY)
    ctx.textAlign = 'left'
    ctx.fillText(String(row + 1), x + rulerSize + gridW + 5, labelY)
    ctx.textAlign = 'right'
  }

  ctx.strokeStyle = 'rgba(52,32,95,0.2)'
  ctx.lineWidth = 1
  ctx.strokeRect(x + rulerSize, y + rulerSize, gridW, gridH)
  ctx.restore()
}

/** A4 page width in px at 96 DPI (portrait). Preview zoom does not use this. */
export const EXPORT_A4_WIDTH_PX = 794
export const EXPORT_SHEET_PADDING_PX = 48
const EXPORT_DENSITY_SCALE = 3
const EXPORT_MAX_CANVAS_EDGE_PX = 8192

/** Largest bead size so the pattern grid spans the printable width on an A4 export. */
export function exportCellPxForPattern(
  pattern: BeadPattern,
  display?: PatternGridDisplay,
): number {
  const contentWidth = EXPORT_A4_WIDTH_PX - EXPORT_SHEET_PADDING_PX * 2
  const minCellPx = display?.label === 'none' ? 4 : MIN_READABLE_LABEL_CELL_PX
  const maxCellPx = 72
  let best = minCellPx

  for (let cellPx = minCellPx; cellPx <= maxCellPx; cellPx++) {
    const exportGridW = rulerBandSize(cellPx) * 2 + pattern.width * cellPx
    if (exportGridW <= contentWidth) best = cellPx
  }

  return best
}

export async function renderPatternExportToCanvas(
  pattern: BeadPattern,
  cellPx: number,
  display: PatternGridDisplay,
  options: { includePoofPixelsHandle?: boolean } = {},
): Promise<HTMLCanvasElement> {
  const logo = await loadExportLogo()
  const stats = exportColorStats(pattern)
  const padding = 48
  const headerH = 156
  const footerGap = 56
  const gridW = pattern.width * cellPx
  const gridH = pattern.height * cellPx
  const rulerSize = rulerBandSize(cellPx)
  const exportGridW = rulerSize * 2 + gridW
  const exportGridH = rulerSize * 2 + gridH
  const sheetW = Math.max(EXPORT_A4_WIDTH_PX, Math.ceil(exportGridW + padding * 2))
  const contentW = sheetW - padding * 2
  const colorColumns = Math.max(
    1,
    Math.floor(
      (contentW + EXPORT_COLOR_CARD_GAP) / (EXPORT_COLOR_CARD_W + EXPORT_COLOR_CARD_GAP),
    ),
  )
  const colorRows = Math.ceil(stats.length / colorColumns)
  const computedBreakdownH =
    EXPORT_COLOR_TITLE_SIZE +
    18 +
    colorRows * EXPORT_COLOR_CARD_H +
    Math.max(0, colorRows - 1) * EXPORT_COLOR_CARD_GAP
  const footerH = footerGap + computedBreakdownH + 72
  const logicalCanvasH = headerH + exportGridH + footerH
  const exportScale = Math.max(
    1,
    Math.min(
      EXPORT_DENSITY_SCALE,
      EXPORT_MAX_CANVAS_EDGE_PX / Math.max(sheetW, logicalCanvasH),
    ),
  )

  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(sheetW * exportScale)
  canvas.height = Math.ceil(logicalCanvasH * exportScale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas not supported')
  ctx.imageSmoothingEnabled = false
  ctx.scale(exportScale, exportScale)

  ctx.fillStyle = EXPORT_THEME.background
  ctx.fillRect(0, 0, sheetW, logicalCanvasH)

  ctx.fillStyle = EXPORT_THEME.purple
  ctx.fillRect(padding, 18, contentW * 0.64, 5)
  ctx.fillStyle = EXPORT_THEME.pink
  ctx.fillRect(padding + contentW * 0.64, 18, contentW * 0.36, 5)

  const summaryX = logo ? padding + 180 : padding
  if (logo) {
    const logoW = 140
    const logoH = Math.round((logo.height / logo.width) * logoW)
    const y = 38
    ctx.drawImage(logo, padding, y, logoW, logoH)
  } else {
    ctx.fillStyle = EXPORT_THEME.deepPurple
    ctx.font = '800 42px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'top'
    ctx.fillText('Poof Pixels Pattern', padding, 42)
  }

  ctx.textAlign = 'right'
  if (options.includePoofPixelsHandle) {
    ctx.font = '700 22px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = EXPORT_THEME.pink
    ctx.fillText('@poofpixels', sheetW - padding, 46)
    ctx.font = '600 18px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = EXPORT_THEME.muted
    ctx.fillText('pixels.poofcakes.com', sheetW - padding, 78)
  } else {
    ctx.font = '600 18px ui-sans-serif, system-ui, sans-serif'
    ctx.fillStyle = EXPORT_THEME.muted
    ctx.fillText('pixels.poofcakes.com', sheetW - padding, 58)
  }

  ctx.fillStyle = EXPORT_THEME.deepPurple
  ctx.textAlign = 'left'
  ctx.font = '700 20px ui-sans-serif, system-ui, sans-serif'
  ctx.fillText(
    `${pattern.totalBeads.toLocaleString()} beads · ${pattern.uniqueColors} colours · ${pattern.width} x ${pattern.height} grid`,
    summaryX,
    106,
  )

  const gridX = Math.floor((sheetW - exportGridW) / 2)
  const gridY = headerH
  drawExportRulers(ctx, pattern, cellPx, gridX, gridY, rulerSize)
  ctx.save()
  ctx.translate(gridX + rulerSize, gridY + rulerSize)
  drawPatternGrid(ctx, pattern, cellPx, {
    display,
    usePaletteColors: display.useMardColors,
  })
  ctx.restore()

  const breakdownY = gridY + exportGridH + footerGap
  drawExportColorBreakdown(ctx, stats, padding, breakdownY, contentW)

  ctx.fillStyle = EXPORT_THEME.muted
  ctx.font = '700 18px ui-sans-serif, system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(
    `${pattern.totalBeads.toLocaleString()} total beads`,
    padding,
    logicalCanvasH - 28,
  )
  ctx.fillStyle = EXPORT_THEME.deepPurple
  ctx.textAlign = 'right'
  ctx.textBaseline = 'bottom'
  ctx.fillText(
    'Make your own bead patterns at pixels.poofcakes.com',
    sheetW - padding,
    logicalCanvasH - 28,
  )

  return canvas
}
