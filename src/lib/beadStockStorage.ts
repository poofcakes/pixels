import type { BeadPaletteId } from '@/lib/beadPalettes'

const STORAGE_PREFIX = 'craft-bead-stock-v1'

function storageKey(paletteId: BeadPaletteId): string {
  return `${STORAGE_PREFIX}:${paletteId}`
}

/** All codes enabled when nothing is saved yet. */
export function loadEnabledStock(paletteId: BeadPaletteId, allCodes: string[]): Set<string> {
  if (typeof window === 'undefined') return new Set(allCodes)

  try {
    const raw = localStorage.getItem(storageKey(paletteId))
    if (!raw) return new Set(allCodes)
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set(allCodes)
    const valid = new Set(allCodes)
    return new Set(parsed.filter((c): c is string => typeof c === 'string' && valid.has(c)))
  } catch {
    return new Set(allCodes)
  }
}

export function saveEnabledStock(paletteId: BeadPaletteId, enabled: ReadonlySet<string>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(storageKey(paletteId), JSON.stringify([...enabled]))
}

export function stockSummary(enabled: Set<string>, total: number): {
  enabled: number
  total: number
  allEnabled: boolean
} {
  return {
    enabled: enabled.size,
    total,
    allEnabled: enabled.size >= total,
  }
}
