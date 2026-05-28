import { getBeadColor } from '@/lib/beadPalettes'
import { deltaE76, hexToRgb, rgbToLab } from '@/lib/beadColorMatch'
import type { CellEditMap } from '@/lib/patternProjects'

import type { BeadPattern, PatternCell } from '@/lib/beadPattern'

export function cellKey(x: number, y: number): string {
  return `${x},${y}`
}

export function getPatternBeadColor(
  paletteId: BeadPattern['paletteId'],
  code: string,
) {
  return getBeadColor(paletteId, code)
}

/** Follow override chain; returns the final palette code. */
export function resolveBeadCode(
  code: string,
  overrides: Record<string, string>,
): string {
  let current = code
  const seen = new Set<string>()
  while (overrides[current] && overrides[current] !== current) {
    if (seen.has(current)) break
    seen.add(current)
    current = overrides[current]
  }
  return current
}

/** @deprecated Use resolveBeadCode */
export const resolveMardCode = resolveBeadCode

function recomputePatternStats(cells: PatternCell[]): Pick<
  BeadPattern,
  'counts' | 'uniqueColors' | 'totalBeads'
> {
  const counts: Record<string, number> = {}
  let totalBeads = 0
  for (const cell of cells) {
    if (!cell.bead) continue
    counts[cell.bead.code] = (counts[cell.bead.code] ?? 0) + 1
    totalBeads++
  }
  return {
    counts,
    uniqueColors: Object.keys(counts).length,
    totalBeads,
  }
}

/** Apply per-original-code overrides on top of a base pattern. */
export function applyPatternEdits(
  base: BeadPattern,
  overrides: Record<string, string>,
): BeadPattern {
  if (Object.keys(overrides).length === 0) return base

  const cells = base.cells.map((cell) => {
    if (!cell.bead) return cell
    const resolved = resolveBeadCode(cell.bead.code, overrides)
    if (resolved === cell.bead.code) return cell
    const bead = getBeadColor(base.paletteId, resolved)
    return bead ? { ...cell, bead } : cell
  })

  return {
    ...base,
    cells,
    ...recomputePatternStats(cells),
  }
}

function labForCode(paletteId: BeadPattern['paletteId'], code: string) {
  const bead = getBeadColor(paletteId, code)
  if (!bead) return [0, 0, 0] as const
  return rgbToLab(...hexToRgb(bead.hex))
}

function clusterCodes(
  paletteId: BeadPattern['paletteId'],
  codes: string[],
  threshold: number,
): string[][] {
  const parent = new Map<string, string>()

  function find(x: string): string {
    const p = parent.get(x)
    if (!p || p === x) {
      parent.set(x, x)
      return x
    }
    const root = find(p)
    parent.set(x, root)
    return root
  }

  function union(a: string, b: string) {
    parent.set(find(a), find(b))
  }

  for (const code of codes) parent.set(code, code)

  for (let i = 0; i < codes.length; i++) {
    for (let j = i + 1; j < codes.length; j++) {
      if (
        deltaE76(labForCode(paletteId, codes[i]), labForCode(paletteId, codes[j])) <=
        threshold
      ) {
        union(codes[i], codes[j])
      }
    }
  }

  const groups = new Map<string, string[]>()
  for (const code of codes) {
    const root = find(code)
    const list = groups.get(root) ?? []
    list.push(code)
    groups.set(root, list)
  }

  return [...groups.values()]
}

function pickClusterRepresentative(
  cluster: string[],
  counts: Record<string, number>,
): string {
  return cluster.reduce((best, code) =>
    (counts[code] ?? 0) > (counts[best] ?? 0) ? code : best,
  )
}

/** Merge colours within ΔE threshold; returns a new override map. */
export function mergeSimilarColorOverrides(
  base: BeadPattern,
  overrides: Record<string, string>,
  threshold: number,
): Record<string, string> {
  const effective = applyPatternEdits(base, overrides)
  const usedCodes = Object.keys(effective.counts)
  if (usedCodes.length < 2) return overrides

  const next = { ...overrides }
  const clusters = clusterCodes(base.paletteId, usedCodes, threshold)

  for (const cluster of clusters) {
    if (cluster.length < 2) continue
    const rep = pickClusterRepresentative(cluster, effective.counts)

    for (const targetCode of cluster) {
      if (targetCode === rep) continue
      for (const cell of base.cells) {
        if (!cell.bead) continue
        const orig = cell.bead.code
        if (resolveBeadCode(orig, overrides) === targetCode) {
          next[orig] = rep
        }
      }
    }
  }

  return next
}

/** Remap every bead currently showing `fromCode` to `toCode`. */
export function replaceColorOverrides(
  base: BeadPattern,
  overrides: Record<string, string>,
  fromCode: string,
  toCode: string,
): Record<string, string> {
  if (fromCode === toCode) return overrides

  const next = { ...overrides }
  for (const cell of base.cells) {
    if (!cell.bead) continue
    const orig = cell.bead.code
    if (resolveBeadCode(orig, overrides) === fromCode) {
      next[orig] = toCode
    }
  }
  return next
}

export function hasPatternEdits(overrides: Record<string, string>): boolean {
  return Object.keys(overrides).length > 0
}

export function hasCellEdits(cellEdits: CellEditMap): boolean {
  return Object.keys(cellEdits).length > 0
}

/** Apply global colour overrides, then per-cell paint/erase edits. */
export function applyAllPatternEdits(
  base: BeadPattern,
  overrides: Record<string, string>,
  cellEdits: CellEditMap,
): BeadPattern {
  let pattern = applyPatternEdits(base, overrides)
  if (!hasCellEdits(cellEdits)) return pattern

  const cells = pattern.cells.map((cell) => {
    const key = cellKey(cell.x, cell.y)
    if (!(key in cellEdits)) return cell
    const edit = cellEdits[key]
    if (edit === null) {
      return { ...cell, sourceRgb: null, bead: null }
    }
    const bead = getBeadColor(pattern.paletteId, edit)
    return bead ? { ...cell, sourceRgb: null, bead } : cell
  })

  return {
    ...pattern,
    cells,
    ...recomputePatternStats(cells),
  }
}

export type PatternCanvasPadding = {
  top: number
  right: number
  bottom: number
  left: number
}

/** Grow the bead grid by empty rows/columns on the given sides (bakes current cell state). */
export function extendBeadPattern(
  pattern: BeadPattern,
  padding: PatternCanvasPadding,
): BeadPattern {
  const top = Math.max(0, Math.floor(padding.top))
  const right = Math.max(0, Math.floor(padding.right))
  const bottom = Math.max(0, Math.floor(padding.bottom))
  const left = Math.max(0, Math.floor(padding.left))
  const width = pattern.width + left + right
  const height = pattern.height + top + bottom

  const cells: PatternCell[] = Array.from({ length: width * height }, (_, index) => {
    const x = index % width
    const y = Math.floor(index / width)
    return { x, y, sourceRgb: null, bead: null }
  })

  for (const cell of pattern.cells) {
    const x = cell.x + left
    const y = cell.y + top
    cells[y * width + x] = {
      ...cell,
      x,
      y,
    }
  }

  return {
    ...pattern,
    width,
    height,
    cells,
    naturalWidth: width,
    naturalHeight: height,
    ...recomputePatternStats(cells),
  }
}

export type EditSnapshot = {
  colorOverrides: Record<string, string>
  cellEdits: CellEditMap
}

export function hasAnyEdits(snapshot: EditSnapshot): boolean {
  return hasPatternEdits(snapshot.colorOverrides) || hasCellEdits(snapshot.cellEdits)
}
