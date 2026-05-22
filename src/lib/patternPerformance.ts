/** Max file-pixel edge length when decoding (reduces memory & CPU). */
export const MAX_SOURCE_EDGE_PX = 2048

/** Max bead columns/rows after trim + block merge (nearest-neighbour shrink). */
export const MAX_BEAD_GRID_EDGE = 384

/** Above this cell count, preview uses canvas instead of per-bead DOM nodes. */
export const DOM_PREVIEW_CELL_LIMIT = 8_000

/** Rows between `scheduler.yield()` during colour matching. */
export const MATCH_YIELD_ROW_INTERVAL = 12

export function scaleToMaxEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; scale: number } {
  const long = Math.max(width, height)
  if (long <= maxEdge) return { width, height, scale: 1 }
  const scale = maxEdge / long
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
  }
}

export function resizeImageDataNearest(
  src: ImageData,
  outWidth: number,
  outHeight: number,
): ImageData {
  const out = new ImageData(outWidth, outHeight)
  const scaleX = src.width / outWidth
  const scaleY = src.height / outHeight

  for (let y = 0; y < outHeight; y++) {
    const sy = Math.min(src.height - 1, Math.floor(y * scaleY))
    for (let x = 0; x < outWidth; x++) {
      const sx = Math.min(src.width - 1, Math.floor(x * scaleX))
      const srcI = (sy * src.width + sx) * 4
      const dstI = (y * outWidth + x) * 4
      out.data[dstI] = src.data[srcI]
      out.data[dstI + 1] = src.data[srcI + 1]
      out.data[dstI + 2] = src.data[srcI + 2]
      out.data[dstI + 3] = src.data[srcI + 3]
    }
  }

  return out
}

export function capBeadGridDimensions(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number; scale: number } {
  return scaleToMaxEdge(width, height, maxEdge)
}

export async function yieldToMain(): Promise<void> {
  const sched = (
    globalThis as typeof globalThis & { scheduler?: { yield(): Promise<void> } }
  ).scheduler
  if (sched?.yield) {
    await sched.yield()
    return
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0)
  })
}

export function shouldUseCanvasPreview(cellCount: number): boolean {
  return cellCount > DOM_PREVIEW_CELL_LIMIT
}
