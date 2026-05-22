import type { BeadPattern } from '@/lib/beadPattern'

const STORAGE_PREFIX = 'craft-bead-completed-v1'

/** Stable id for the current pattern shape + colour mix (survives page refresh). */
export function patternFingerprint(pattern: BeadPattern): string {
  const parts = Object.entries(pattern.counts).sort(([a], [b]) =>
    a.localeCompare(b, undefined, { numeric: true }),
  )
  const sig = parts.map(([code, n]) => `${code}:${n}`).join(',')
  return `${pattern.paletteId}|${pattern.width}x${pattern.height}|${sig}`
}

function storageKey(fingerprint: string): string {
  return `${STORAGE_PREFIX}:${fingerprint}`
}

export function loadCompletedCodes(
  fingerprint: string,
  validCodes: readonly string[],
): Set<string> {
  if (typeof window === 'undefined') return new Set()

  const valid = new Set(validCodes)
  try {
    const raw = localStorage.getItem(storageKey(fingerprint))
    if (!raw) return new Set()
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return new Set()
    return new Set(parsed.filter((c): c is string => typeof c === 'string' && valid.has(c)))
  } catch {
    return new Set()
  }
}

export function saveCompletedCodes(fingerprint: string, completed: ReadonlySet<string>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(storageKey(fingerprint), JSON.stringify([...completed]))
}
