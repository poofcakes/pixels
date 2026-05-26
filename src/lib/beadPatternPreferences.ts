const PREFS_KEY = 'craft-bead-pattern-prefs-v1'

export type BeadPatternPrefs = {
  usePaletteColors: boolean
  restrictToStock: boolean
}

const DEFAULT_PREFS: BeadPatternPrefs = {
  usePaletteColors: true,
  restrictToStock: false,
}

export function loadPatternPrefs(): BeadPatternPrefs {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFS }

  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return { ...DEFAULT_PREFS }
    const parsed = JSON.parse(raw) as Partial<BeadPatternPrefs>
    return {
      usePaletteColors: DEFAULT_PREFS.usePaletteColors,
      restrictToStock:
        typeof parsed.restrictToStock === 'boolean'
          ? parsed.restrictToStock
          : DEFAULT_PREFS.restrictToStock,
    }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

export function savePatternPrefs(partial: Partial<BeadPatternPrefs>): void {
  if (typeof window === 'undefined') return
  const next = {
    ...loadPatternPrefs(),
    ...partial,
    usePaletteColors: DEFAULT_PREFS.usePaletteColors,
  }
  localStorage.setItem(PREFS_KEY, JSON.stringify(next))
}
