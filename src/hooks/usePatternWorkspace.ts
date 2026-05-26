'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'

import type { StudioTool } from '@/components/patternStudioTypes'
import type { BeadStatRow } from '@/components/BeadCountList'
import {
  BEAD_PALETTES,
  getBeadPalette,
  getPaletteColorCount,
  type BeadPaletteId,
} from '@/lib/beadPalettes'
import { BEAD_MATCH_METHODS, type BeadMatchMethod } from '@/lib/beadColorMatch'
import {
  fitPatternToPegboards,
  patternFromImageFile,
  renderPatternToCanvas,
  type BeadPattern,
  type PatternGridDisplay,
} from '@/lib/beadPattern'
import { loadPatternPrefs, savePatternPrefs } from '@/lib/beadPatternPreferences'
import {
  loadCompletedCodes,
  patternFingerprint,
  saveCompletedCodes,
} from '@/lib/patternCompletedStorage'
import {
  applyAllPatternEdits,
  cellKey,
  hasAnyEdits,
  replaceColorOverrides,
  type EditSnapshot,
} from '@/lib/patternEdits'
import { imageIdFromFile, loadPatternImage, savePatternImage } from '@/lib/patternImageStorage'
import {
  clearAutosave,
  createProjectId,
  type CellEditMap,
  deleteAllProjectsWithImages,
  deleteProjectWithImage,
  exportProjectsFile,
  importProjectFiles,
  isRestoreDismissed,
  loadAutosave,
  loadProjects,
  saveAutosave,
  saveProjects,
  setRestoreDismissed,
  type ProjectImportMode,
  type PatternProjectSettings,
  type PatternProjectState,
} from '@/lib/patternProjects'
import { loadEnabledStock, saveEnabledStock } from '@/lib/beadStockStorage'
import { DEFAULT_TARGET_CANVAS_WIDTH, MAX_BEAD_GRID_EDGE } from '@/lib/patternPerformance'

type BrandPaletteId = Exclude<BeadPaletteId, 'mixed'>

function fileBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'Untitled'
}

/** Default canvas width for a new upload (null = auto from detected bead grid). */
function defaultTargetCanvasWidthForFileWidth(fileWidth: number): number | null {
  return fileWidth > DEFAULT_TARGET_CANVAS_WIDTH ? DEFAULT_TARGET_CANVAS_WIDTH : null
}

function defaultTargetCanvasWidthForNaturalWidth(naturalWidth: number): number | null {
  return naturalWidth > DEFAULT_TARGET_CANVAS_WIDTH ? DEFAULT_TARGET_CANVAS_WIDTH : null
}

async function imageDimensions(file: Blob): Promise<{ width: number; height: number } | null> {
  try {
    const bitmap = await createImageBitmap(file)
    const dimensions = { width: bitmap.width, height: bitmap.height }
    bitmap.close()
    return dimensions
  } catch {
    return null
  }
}

const beadCodeCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
})

function floodFillCellKeys(
  pattern: BeadPattern,
  startX: number,
  startY: number,
): string[] {
  const start = pattern.cells[startY * pattern.width + startX]
  const targetCode = start?.bead?.code ?? null
  const seen = new Set<string>()
  const keys: string[] = []
  const queue: Array<{ x: number; y: number }> = [{ x: startX, y: startY }]

  while (queue.length) {
    const cell = queue.pop()
    if (!cell) continue
    if (cell.x < 0 || cell.y < 0 || cell.x >= pattern.width || cell.y >= pattern.height) continue

    const key = cellKey(cell.x, cell.y)
    if (seen.has(key)) continue
    const current = pattern.cells[cell.y * pattern.width + cell.x]
    if ((current?.bead?.code ?? null) !== targetCode) continue

    seen.add(key)
    keys.push(key)
    queue.push(
      { x: cell.x + 1, y: cell.y },
      { x: cell.x - 1, y: cell.y },
      { x: cell.x, y: cell.y + 1 },
      { x: cell.x, y: cell.y - 1 },
    )
  }

  return keys
}

function mirrorPatternHorizontally(pattern: BeadPattern): Record<string, string | null> {
  const edits: Record<string, string | null> = {}
  for (let y = 0; y < pattern.height; y++) {
    for (let x = 0; x < pattern.width; x++) {
      const source = pattern.cells[y * pattern.width + (pattern.width - 1 - x)]
      edits[cellKey(x, y)] = source?.bead?.code ?? null
    }
  }
  return edits
}

type ProcessSnapshot = {
  fileKey: string
  baseSignature: string
  resultWidth: number
  resultHeight: number
  pegboardSize: number | null
  pegboardAnchor: NonNullable<PatternProjectSettings['pegboardAnchor']>
}

function pegboardPlacement(
  width: number,
  height: number,
  boardSize: number | null,
  anchor: NonNullable<PatternProjectSettings['pegboardAnchor']>,
) {
  if (!boardSize) return { width, height, offsetX: 0, offsetY: 0 }

  const size = Math.max(1, Math.floor(boardSize))
  const fittedWidth = Math.ceil(width / size) * size
  const fittedHeight = Math.ceil(height / size) * size
  const freeX = fittedWidth - width
  const freeY = fittedHeight - height
  const offsetX =
    anchor === 'top-center' || anchor === 'center' || anchor === 'bottom-center'
      ? Math.floor(freeX / 2)
      : anchor.endsWith('right')
        ? freeX
        : 0
  const offsetY =
    anchor === 'middle-left' || anchor === 'center' || anchor === 'middle-right'
      ? Math.floor(freeY / 2)
      : anchor.startsWith('bottom')
        ? freeY
        : 0

  return { width: fittedWidth, height: fittedHeight, offsetX, offsetY }
}

function parseCellEditKey(key: string): { x: number; y: number } | null {
  const [xRaw, yRaw] = key.split(',')
  const x = Number(xRaw)
  const y = Number(yRaw)
  if (!Number.isInteger(x) || !Number.isInteger(y)) return null
  return { x, y }
}

function rebasePegboardCellEdits(
  edits: CellEditMap,
  previous: ProcessSnapshot,
  next: ProcessSnapshot,
): CellEditMap {
  const oldPlacement = pegboardPlacement(
    previous.resultWidth,
    previous.resultHeight,
    previous.pegboardSize,
    previous.pegboardAnchor,
  )
  const newPlacement = pegboardPlacement(
    next.resultWidth,
    next.resultHeight,
    next.pegboardSize,
    next.pegboardAnchor,
  )
  const nextEdits: CellEditMap = {}

  for (const [key, edit] of Object.entries(edits)) {
    const cell = parseCellEditKey(key)
    if (!cell) continue

    const x = cell.x - oldPlacement.offsetX + newPlacement.offsetX
    const y = cell.y - oldPlacement.offsetY + newPlacement.offsetY
    if (x < 0 || y < 0 || x >= newPlacement.width || y >= newPlacement.height) continue
    nextEdits[cellKey(x, y)] = edit
  }

  return nextEdits
}

function defaultSettings(): PatternProjectSettings {
  return {
    paletteId: 'mard',
    mixedBrandIds: BEAD_PALETTES.filter((p) => p.id !== 'mixed').map((p) => p.id as BrandPaletteId),
    paletteLimit: 50,
    targetCanvasWidth: null,
    pegboardSize: null,
    pegboardAnchor: 'top-left',
    pixelBlockSize: 'auto',
    matchMethod: 'lab76',
    trimTransparent: true,
    removeBackground: false,
    restrictToStock: false,
    enabledStock: [],
    usePaletteColors: true,
    showCodes: false,
    showGridGuidesOnTop: false,
    includePoofPixelsHandle: false,
    cellPx: 15,
  }
}

function firstPaletteCode(paletteId: BeadPaletteId): string {
  return getBeadPalette(paletteId).colors[0]?.code ?? ''
}

function fileProcessKey(file: File): string {
  return [file.name, file.type, file.size, file.lastModified].join(':')
}

function codesProcessKey(codes: ReadonlySet<string> | null): string {
  if (!codes) return ''
  return [...codes].sort(beadCodeCollator.compare).join('|')
}

function processDisplayDimensions(snapshot: ProcessSnapshot): { width: number; height: number } {
  if (!snapshot.pegboardSize) {
    return { width: snapshot.resultWidth, height: snapshot.resultHeight }
  }

  return {
    width: Math.ceil(snapshot.resultWidth / snapshot.pegboardSize) * snapshot.pegboardSize,
    height: Math.ceil(snapshot.resultHeight / snapshot.pegboardSize) * snapshot.pegboardSize,
  }
}

function recordsEqual<T extends string | null>(
  a: Record<string, T>,
  b: Record<string, T>,
): boolean {
  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((key) => a[key] === b[key])
}

function projectThumbnailDataUrl(pattern: BeadPattern, display: PatternGridDisplay): string {
  const maxEdge = 96
  const cellPx = Math.max(1, Math.min(4, Math.floor(maxEdge / Math.max(pattern.width, pattern.height))))
  const canvas = renderPatternToCanvas(pattern, cellPx, {
    ...display,
    label: 'none',
    showGridGuidesOnTop: false,
  })
  const thumb = document.createElement('canvas')
  const scale = Math.min(1, maxEdge / Math.max(canvas.width, canvas.height))
  thumb.width = Math.max(1, Math.round(canvas.width * scale))
  thumb.height = Math.max(1, Math.round(canvas.height * scale))
  const ctx = thumb.getContext('2d')
  if (!ctx) return canvas.toDataURL('image/png')
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = '#1a1814'
  ctx.fillRect(0, 0, thumb.width, thumb.height)
  ctx.drawImage(canvas, 0, 0, thumb.width, thumb.height)
  return thumb.toDataURL('image/webp', 0.82)
}

function askImportMode(projectCount: number, t: ReturnType<typeof useTranslations>): ProjectImportMode | null {
  if (projectCount === 0) return 'append'
  const response = window.prompt(t('importProjectModePrompt'), 'append')
  if (response === null) return null
  const normalized = response.trim().toLowerCase()
  if (normalized === 'replace') return 'replace'
  if (normalized === 'append' || normalized === '') return 'append'
  window.alert(t('importProjectModeInvalid'))
  return null
}

export function usePatternWorkspace() {
  const t = useTranslations('pattern')
  const importProjectRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [fileDimensions, setFileDimensions] = useState<{ width: number; height: number } | null>(null)
  const [imageId, setImageId] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [basePattern, setBasePattern] = useState<BeadPattern | null>(null)
  const [autoCanvasWidth, setAutoCanvasWidth] = useState<number | null>(null)
  const [editHistory, setEditHistory] = useState<EditSnapshot[]>([
    { colorOverrides: {}, cellEdits: {} },
  ])
  const editStrokeActiveRef = useRef(false)
  const editStrokeHasEditRef = useRef(false)
  const preserveEditsOnProcessRef = useRef(false)
  const autoZoomRef = useRef(true)
  const pendingTargetCanvasWidthRef = useRef<number | null | undefined>(undefined)
  const reprocessFileRef = useRef<File | null>(null)
  const lastProcessSnapshotRef = useRef<ProcessSnapshot | null>(null)
  const editSnapshot = editHistory[editHistory.length - 1] ?? {
    colorOverrides: {},
    cellEdits: {},
  }
  const latestEditSnapshotRef = useRef<EditSnapshot>(editSnapshot)
  const canUndoEdits = editHistory.length > 1

  const [selectedCode, setSelectedCode] = useState<string | null>(null)
  const [brushCode, setBrushCode] = useState(() => firstPaletteCode('mard'))
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRestoreBanner, setShowRestoreBanner] = useState(false)

  const [settings, setSettings] = useState<PatternProjectSettings>(defaultSettings)
  const [projects, setProjects] = useState<PatternProjectState[]>([])
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null)
  const [projectName, setProjectName] = useState('')

  const [hovered, setHovered] = useState<{ x: number; y: number } | null>(null)
  const [completedCodes, setCompletedCodes] = useState<Set<string>>(() => new Set())
  const [statsSortMode, setStatsSortMode] = useState<'count' | 'code'>('count')

  const palette = useMemo(() => getBeadPalette(settings.paletteId), [settings.paletteId])
  const paletteColorCount = getPaletteColorCount(settings.paletteId)

  const mixedBrandCodes = useMemo(() => {
    if (settings.paletteId !== 'mixed') return null
    return new Set(
      palette.colors
        .filter(
          (c) => c.brandId && settings.mixedBrandIds.includes(c.brandId as BrandPaletteId),
        )
        .map((c) => c.code),
    )
  }, [settings.paletteId, settings.mixedBrandIds, palette.colors])

  const activePaletteColorCount = mixedBrandCodes?.size ?? paletteColorCount

  const allCodes = useMemo(() => palette.colors.map((c) => c.code), [palette.colors])

  useEffect(() => {
    if (palette.colors.some((c) => c.code === brushCode)) return
    setBrushCode(palette.colors[0]?.code ?? '')
  }, [brushCode, palette.colors])

  useEffect(() => {
    const prefs = loadPatternPrefs()
    setSettings((s) => ({
      ...s,
      restrictToStock: prefs.restrictToStock,
      usePaletteColors: prefs.usePaletteColors,
    }))
    setProjects(loadProjects())
    const autosave = loadAutosave()
    if (autosave && !isRestoreDismissed()) setShowRestoreBanner(true)
  }, [])

  useEffect(() => {
    if (settings.paletteId === 'mixed') return
    setSettings((s) => ({
      ...s,
      enabledStock: [...loadEnabledStock(settings.paletteId, allCodes)],
    }))
  }, [settings.paletteId, allCodes])

  const enabledStockSet = useMemo(
    () => new Set(settings.enabledStock),
    [settings.enabledStock],
  )

  const allowedCodes = useMemo(() => {
    if (settings.restrictToStock && mixedBrandCodes) {
      return new Set([...enabledStockSet].filter((code) => mixedBrandCodes.has(code)))
    }
    if (settings.restrictToStock) return enabledStockSet
    return mixedBrandCodes
  }, [settings.restrictToStock, mixedBrandCodes, enabledStockSet])

  const gridDisplay = useMemo<PatternGridDisplay>(
    () => ({
      useMardColors: settings.usePaletteColors,
      label: settings.showCodes ? 'code' : 'none',
      boardSize: settings.pegboardSize,
      showGridGuidesOnTop: settings.showGridGuidesOnTop,
    }),
    [
      settings.usePaletteColors,
      settings.showCodes,
      settings.pegboardSize,
      settings.showGridGuidesOnTop,
    ],
  )

  const pattern = useMemo(
    () =>
      basePattern
        ? applyAllPatternEdits(
            basePattern,
            editSnapshot.colorOverrides,
            editSnapshot.cellEdits,
          )
        : null,
    [basePattern, editSnapshot],
  )

  useEffect(() => {
    latestEditSnapshotRef.current = editSnapshot
  }, [editSnapshot])

  const pushEdit = useCallback((next: EditSnapshot, options?: { coalesceStroke?: boolean }) => {
    const coalesceStroke = options?.coalesceStroke ?? true
    latestEditSnapshotRef.current = next
    setEditHistory((h) => {
      const replaceStrokeSnapshot =
        coalesceStroke && editStrokeActiveRef.current && editStrokeHasEditRef.current
      if (coalesceStroke && editStrokeActiveRef.current) editStrokeHasEditRef.current = true
      if (replaceStrokeSnapshot && h.length > 1) return [...h.slice(0, -1), next]
      return [...h, next]
    })
  }, [])

  const undoEdits = useCallback(() => {
    setEditHistory((h) => (h.length > 1 ? h.slice(0, -1) : h))
  }, [])

  const resetEdits = useCallback(() => {
    setEditHistory([{ colorOverrides: {}, cellEdits: {} }])
  }, [])

  const beginEditStroke = useCallback(() => {
    editStrokeActiveRef.current = true
    editStrokeHasEditRef.current = false
  }, [])

  const endEditStroke = useCallback(() => {
    editStrokeActiveRef.current = false
    editStrokeHasEditRef.current = false
  }, [])

  const {
    paletteId,
    paletteLimit,
    pegboardSize,
    pegboardAnchor,
    targetCanvasWidth,
    pixelBlockSize,
    matchMethod,
    trimTransparent,
    removeBackground,
  } = settings

  const runProcess = useCallback(
    (target: File) => {
      let cancelled = false
      const resolvedTargetCanvasWidth =
        pendingTargetCanvasWidthRef.current !== undefined
          ? pendingTargetCanvasWidthRef.current
          : targetCanvasWidth
      pendingTargetCanvasWidthRef.current = undefined

      const baseSignature = JSON.stringify({
        file: fileProcessKey(target),
        paletteId,
        paletteLimit,
        targetCanvasWidth: resolvedTargetCanvasWidth,
        pixelBlockSize,
        matchMethod,
        trimTransparent,
        removeBackground,
        allowedCodes: codesProcessKey(allowedCodes),
      })
      setLoading(true)
      setError(null)

      if (mixedBrandCodes && mixedBrandCodes.size === 0) {
        setError(t('mixedBrandsEmpty'))
        setLoading(false)
        return () => {
          cancelled = true
        }
      }

      if (allowedCodes && allowedCodes.size === 0) {
        setError(t('stockEmpty'))
        setLoading(false)
        return () => {
          cancelled = true
        }
      }

      void patternFromImageFile(target, {
        paletteId,
        trimTransparent,
        removeBackground,
        pixelBlockSize: resolvedTargetCanvasWidth ? 'auto' : pixelBlockSize,
        targetCanvasWidth: resolvedTargetCanvasWidth,
        paletteLimit,
        matchMethod,
        allowedCodes,
      })
        .then((result) => {
          if (!cancelled) {
            const fitted = pegboardSize
              ? fitPatternToPegboards(result, pegboardSize, pegboardAnchor ?? 'top-left')
              : result
            const previousProcess = lastProcessSnapshotRef.current
            const fileKey = fileProcessKey(target)
            const nextProcess: ProcessSnapshot = {
              fileKey,
              baseSignature,
              resultWidth: result.width,
              resultHeight: result.height,
              pegboardSize,
              pegboardAnchor: pegboardAnchor ?? 'top-left',
            }
            const isNewFile = !previousProcess || previousProcess.fileKey !== fileKey
            const previousSize = previousProcess ? processDisplayDimensions(previousProcess) : null
            const nextSize = processDisplayDimensions(nextProcess)
            if (!previousSize || previousSize.width !== nextSize.width || previousSize.height !== nextSize.height) {
              autoZoomRef.current = true
            }
            setBasePattern(fitted)
            const naturalWidth = result.naturalWidth ?? result.width
            setAutoCanvasWidth(naturalWidth)
            if (isNewFile) {
              const desiredTarget = defaultTargetCanvasWidthForNaturalWidth(naturalWidth)
              setSettings((s) => {
                if (s.targetCanvasWidth === desiredTarget) return s
                return { ...s, targetCanvasWidth: desiredTarget, pixelBlockSize: 'auto' }
              })
              if (desiredTarget !== resolvedTargetCanvasWidth) {
                pendingTargetCanvasWidthRef.current = desiredTarget
                reprocessFileRef.current = target
              }
            }
            if (!preserveEditsOnProcessRef.current) {
              if (previousProcess?.baseSignature === baseSignature) {
                const currentEdits = latestEditSnapshotRef.current
                const rebasedEdits: EditSnapshot = {
                  colorOverrides: currentEdits.colorOverrides,
                  cellEdits: rebasePegboardCellEdits(
                    currentEdits.cellEdits,
                    previousProcess,
                    nextProcess,
                  ),
                }
                latestEditSnapshotRef.current = rebasedEdits
                setEditHistory([rebasedEdits])
              } else {
                const emptyEdits = { colorOverrides: {}, cellEdits: {} }
                latestEditSnapshotRef.current = emptyEdits
                setEditHistory([emptyEdits])
              }
            } else {
              preserveEditsOnProcessRef.current = false
            }
            lastProcessSnapshotRef.current = nextProcess
            setSelectedCode(null)
            setError(null)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError(t('errorLoad'))
            setBasePattern(null)
            setEditHistory([{ colorOverrides: {}, cellEdits: {} }])
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false)
        })

      return () => {
        cancelled = true
      }
    },
    [
      allowedCodes,
      matchMethod,
      mixedBrandCodes,
      paletteId,
      paletteLimit,
      pegboardSize,
      pegboardAnchor,
      pixelBlockSize,
      removeBackground,
      t,
      targetCanvasWidth,
      trimTransparent,
    ],
  )

  useEffect(() => {
    if (!file) return
    return runProcess(file)
  }, [file, runProcess])

  useEffect(() => {
    const pending = reprocessFileRef.current
    if (!pending) return
    reprocessFileRef.current = null
    return runProcess(pending)
  }, [settings.targetCanvasWidth, runProcess])

  const persistImage = useCallback(async (target: File) => {
    const id = imageIdFromFile(target)
    await savePatternImage(id, target, {
      fileName: target.name,
      mimeType: target.type || 'image/png',
    })
    setImageId(id)
    return id
  }, [])

  const onPickFile = useCallback(
    async (next: File | null) => {
      if (!next) return
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setAutoCanvasWidth(null)
      autoZoomRef.current = true
      setActiveProjectId(null)
      setProjectName(fileBaseName(next.name))
      setPreviewUrl(URL.createObjectURL(next))
      const dimensions = await imageDimensions(next)
      const nextTarget = dimensions
        ? defaultTargetCanvasWidthForFileWidth(dimensions.width)
        : null
      pendingTargetCanvasWidthRef.current = nextTarget
      setFileDimensions(dimensions)
      setSettings((s) => ({
        ...s,
        targetCanvasWidth: nextTarget,
        pixelBlockSize: 'auto',
      }))
      const emptyEdits = { colorOverrides: {}, cellEdits: {} }
      latestEditSnapshotRef.current = emptyEdits
      setEditHistory([emptyEdits])
      lastProcessSnapshotRef.current = null
      setFile(next)
      await persistImage(next)
    },
    [previewUrl, persistImage],
  )

  const autosave = useCallback(() => {
    if (!file || !imageId) return
    saveAutosave({
      projectId: activeProjectId,
      imageId,
      settings,
      colorOverrides: editSnapshot.colorOverrides,
      cellEdits: editSnapshot.cellEdits,
      completedCodes: [...completedCodes],
      updatedAt: Date.now(),
    })
  }, [file, imageId, activeProjectId, settings, editSnapshot, completedCodes])

  useEffect(() => {
    autosave()
  }, [autosave])

  const restoreSession = useCallback(async () => {
    const session = loadAutosave()
    if (!session) return
    const stored = await loadPatternImage(session.imageId)
    if (!stored) {
      setError(t('errorLoad'))
      return
    }
    const restored = new File([stored.blob], stored.meta.fileName, {
      type: stored.meta.mimeType,
    })
    const dimensions = await imageDimensions(stored.blob)
    setSettings(session.settings)
    setProjectName(fileBaseName(stored.meta.fileName))
    const restoredEdits: EditSnapshot = {
      colorOverrides: session.colorOverrides,
      cellEdits: session.cellEdits,
    }
    setEditHistory([restoredEdits])
    latestEditSnapshotRef.current = restoredEdits
    setCompletedCodes(new Set(session.completedCodes))
    setActiveProjectId(session.projectId)
    setImageId(session.imageId)
    setAutoCanvasWidth(null)
    autoZoomRef.current = false
    preserveEditsOnProcessRef.current = true
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(URL.createObjectURL(stored.blob))
    setFileDimensions(dimensions)
    setFile(restored)
    setShowRestoreBanner(false)
    setRestoreDismissed(false)
  }, [previewUrl, t])

  const dismissRestore = useCallback(() => {
    setShowRestoreBanner(false)
    setRestoreDismissed(true)
  }, [])

  const onPaintCell = useCallback(
    (x: number, y: number, tool: StudioTool) => {
      if (!basePattern) return
      const key = cellKey(x, y)
      const currentSnapshot = latestEditSnapshotRef.current
      const next: EditSnapshot = {
        colorOverrides: { ...currentSnapshot.colorOverrides },
        cellEdits: { ...currentSnapshot.cellEdits },
      }

      if (tool === 'eraser') {
        next.cellEdits[key] = null
        pushEdit(next)
        return
      }

      const idx = y * basePattern.width + x
      const cell = basePattern.cells[idx]
      if (tool === 'picker') {
        const effective = applyAllPatternEdits(
          basePattern,
          currentSnapshot.colorOverrides,
          currentSnapshot.cellEdits,
        )
        const picked = effective.cells[idx]?.bead
        if (picked) {
          setBrushCode(picked.code)
        }
        return
      }

      if (tool === 'bucket' && brushCode) {
        editStrokeActiveRef.current = false
        editStrokeHasEditRef.current = false
        const effective = applyAllPatternEdits(
          basePattern,
          currentSnapshot.colorOverrides,
          currentSnapshot.cellEdits,
        )
        const targetCode = effective.cells[idx]?.bead?.code ?? null
        if (targetCode === brushCode) return
        for (const fillKey of floodFillCellKeys(effective, x, y)) {
          next.cellEdits[fillKey] = brushCode
        }
        pushEdit(next, { coalesceStroke: false })
        return
      }

      if (tool === 'brush' && brushCode) {
        next.cellEdits[key] = brushCode
        pushEdit(next)
      }
    },
    [basePattern, brushCode, pushEdit],
  )

  const mirrorHorizontal = useCallback(() => {
    if (!basePattern) return
    const currentSnapshot = latestEditSnapshotRef.current
    const effective = applyAllPatternEdits(
      basePattern,
      currentSnapshot.colorOverrides,
      currentSnapshot.cellEdits,
    )
    pushEdit({
      colorOverrides: { ...currentSnapshot.colorOverrides },
      cellEdits: mirrorPatternHorizontally(effective),
    })
  }, [basePattern, pushEdit])

  const statRows = useMemo((): BeadStatRow[] => {
    if (!pattern) return []
    const total = pattern.totalBeads || 1
    const hexByCode = new Map<string, string>()
    for (const cell of pattern.cells) {
      if (cell.bead) hexByCode.set(cell.bead.code, cell.bead.hex)
    }
    return Object.entries(pattern.counts)
      .map(([code, count]) => ({
        code,
        count,
        hex: hexByCode.get(code) ?? '#888',
        percent: (count / total) * 100,
      }))
      .sort((a, b) => {
        if (statsSortMode === 'code') return beadCodeCollator.compare(a.code, b.code)
        return b.count - a.count || beadCodeCollator.compare(a.code, b.code)
      })
  }, [pattern, statsSortMode])

  const brushHex = useMemo(
    () => palette.colors.find((c) => c.code === brushCode)?.hex ?? '#888',
    [brushCode, palette.colors],
  )

  const copyBreakdown = useCallback(async () => {
    if (!pattern) return
    const lines = statRows.map((r) => `${r.code}\t${r.count}\t${r.percent.toFixed(1)}%`)
    await navigator.clipboard.writeText(lines.join('\n'))
  }, [pattern, statRows])

  const saveCurrentProject = useCallback(async () => {
    if (!file || !imageId || !pattern) return
    const id = activeProjectId ?? createProjectId()
    const now = Date.now()
    const existing = projects.find((p) => p.id === id)
    const project: PatternProjectState = {
      id,
      name: projectName.trim() || existing?.name || fileBaseName(file.name),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      imageId,
      imageFileName: file.name,
      imageMimeType: file.type || 'image/png',
      settings,
      colorOverrides: editSnapshot.colorOverrides,
      cellEdits: editSnapshot.cellEdits,
      completedCodes: [...completedCodes],
      thumbnailDataUrl: projectThumbnailDataUrl(pattern, gridDisplay),
    }
    const next = [project, ...projects.filter((p) => p.id !== id)]
    saveProjects(next)
    setProjects(next)
    setActiveProjectId(id)
    setProjectName(project.name)
    return project
  }, [
    file,
    imageId,
    pattern,
    activeProjectId,
    projects,
    settings,
    gridDisplay,
    editSnapshot,
    completedCodes,
    projectName,
  ])

  const openProject = useCallback(
    async (project: PatternProjectState) => {
      const stored = await loadPatternImage(project.imageId)
      if (!stored) {
        setError(t('errorLoad'))
        return
      }
      const restored = new File([stored.blob], project.imageFileName, {
        type: project.imageMimeType,
      })
      const dimensions = await imageDimensions(stored.blob)
      setSettings(project.settings)
      setProjectName(project.name)
      const restoredEdits: EditSnapshot = {
        colorOverrides: project.colorOverrides,
        cellEdits: project.cellEdits,
      }
      setEditHistory([restoredEdits])
      latestEditSnapshotRef.current = restoredEdits
      setCompletedCodes(new Set(project.completedCodes))
      setActiveProjectId(project.id)
      setImageId(project.imageId)
      setAutoCanvasWidth(null)
      autoZoomRef.current = false
      preserveEditsOnProcessRef.current = true
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      setPreviewUrl(URL.createObjectURL(stored.blob))
      setFileDimensions(dimensions)
      setFile(restored)
    },
    [previewUrl, t],
  )

  const deleteProject = useCallback(
    async (project: PatternProjectState) => {
      if (!window.confirm(t('deleteProjectConfirm', { name: project.name }))) return
      await deleteProjectWithImage(project.id)
      setProjects(loadProjects())

      if (activeProjectId === project.id) {
        setActiveProjectId(null)
        if (file) {
          const id = await persistImage(file)
          setImageId(id)
        }
      }
    },
    [activeProjectId, file, persistImage, t],
  )

  const deleteAllProjects = useCallback(async () => {
    if (projects.length === 0) return
    if (!window.confirm(t('deleteAllProjectsConfirm', { count: projects.length }))) return

    await deleteAllProjectsWithImages()
    setProjects([])
    setActiveProjectId(null)
    if (file) {
      const id = await persistImage(file)
      setImageId(id)
    }
  }, [file, persistImage, projects.length, t])

  const setCellPx = useCallback((px: number) => {
    autoZoomRef.current = false
    setSettings((s) => ({ ...s, cellPx: px }))
  }, [])

  const setAutoCellPx = useCallback((px: number) => {
    if (!autoZoomRef.current) return
    setSettings((s) => (s.cellPx === px ? s : { ...s, cellPx: px }))
  }, [])

  const exportProjects = useCallback(async () => {
    const savedProject = pattern ? await saveCurrentProject() : undefined
    const projectsToExport = savedProject
      ? [savedProject, ...projects.filter((p) => p.id !== savedProject.id)]
      : projects

    if (projectsToExport.length === 0) return

    const blob = await exportProjectsFile(projectsToExport)
    const a = document.createElement('a')
    const timestamp = new Date()
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z')
      .replace(/[:]/g, '-')
    a.href = URL.createObjectURL(blob)
    a.download = `poofpixels-projects-backup-${timestamp}.poofpixels.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }, [pattern, projects, saveCurrentProject])

  const importProject = useCallback(
    async (f: File) => {
      try {
        const mode = askImportMode(projects.length, t)
        if (!mode) return
        const imported = await importProjectFiles(f, mode)
        setProjects(loadProjects())
        if (imported[0]) await openProject(imported[0])
      } catch {
        setError(t('importProjectError'))
      }
    },
    [openProject, projects.length, t],
  )

  const outputSizeLabel = useMemo(() => {
    if (!pattern) return null
    const designWidth = pattern.designWidth ?? pattern.width
    const designHeight = pattern.designHeight ?? pattern.height
    if (designWidth !== pattern.width || designHeight !== pattern.height) {
      return `${pattern.width} × ${pattern.height} canvas · ${designWidth} × ${designHeight} design`
    }
    return `${pattern.width} × ${pattern.height}`
  }, [pattern])
  const boardLayoutLabel = useMemo(() => {
    if (!pattern || !settings.pegboardSize) return null
    const columns = Math.ceil(pattern.width / settings.pegboardSize)
    const rows = Math.ceil(pattern.height / settings.pegboardSize)
    return `${columns} × ${rows}`
  }, [pattern, settings.pegboardSize])
  const targetCanvasWidthMax = Math.max(
    1,
    Math.min(MAX_BEAD_GRID_EDGE, autoCanvasWidth ?? basePattern?.naturalWidth ?? pattern?.width ?? 200),
  )
  const targetCanvasWidthValue = Math.min(
    targetCanvasWidthMax,
    settings.targetCanvasWidth ?? pattern?.width ?? 1,
  )

  const patternSig = pattern ? patternFingerprint(pattern) : null
  const usedCodesKey = pattern ? Object.keys(pattern.counts).join('|') : ''
  const activeSavedProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? null,
    [activeProjectId, projects],
  )
  const hasUnsavedStep4Edits = useMemo(() => {
    if (!hasAnyEdits(editSnapshot)) return false
    if (!activeSavedProject) return true
    return (
      !recordsEqual(editSnapshot.colorOverrides, activeSavedProject.colorOverrides) ||
      !recordsEqual(editSnapshot.cellEdits, activeSavedProject.cellEdits)
    )
  }, [activeSavedProject, editSnapshot])
  const hasStep4Edits = hasAnyEdits(editSnapshot)

  useEffect(() => {
    if (!patternSig || !usedCodesKey) {
      setCompletedCodes(new Set())
      return
    }
    setCompletedCodes(loadCompletedCodes(patternSig, usedCodesKey.split('|')))
  }, [patternSig, usedCodesKey])

  return {
    t,
    importProjectRef,
    file,
    fileDimensions,
    previewUrl,
    basePattern,
    pattern,
    editSnapshot,
    hasStep4Edits,
    hasUnsavedStep4Edits,
    canUndoEdits,
    pushEdit: (overrides: Record<string, string>) =>
      pushEdit({ ...editSnapshot, colorOverrides: overrides }),
    undoEdits,
    resetEdits,
    selectedCode,
    setSelectedCode,
    brushCode,
    setBrushCode,
    brushHex,
    loading,
    error,
    showRestoreBanner,
    settings,
    setSettings,
    setCellPx,
    setAutoCellPx,
    projectName,
    setProjectName,
    projects,
    activeProjectId,
    palette,
    activePaletteColorCount,
    enabledStockSet,
    gridDisplay,
    hovered,
    setHovered,
    completedCodes,
    setCompletedCodes,
    statsSortMode,
    setStatsSortMode,
    statRows,
    onPickFile,
    onPaintCell,
    mirrorHorizontal,
    beginEditStroke,
    endEditStroke,
    copyBreakdown,
    restoreSession,
    dismissRestore,
    saveCurrentProject,
    openProject,
    deleteProject,
    deleteAllProjects,
    exportProject: exportProjects,
    importProject,
    outputSizeLabel,
    boardLayoutLabel,
    targetCanvasWidthMax,
    targetCanvasWidthValue,
    replaceColorOverrides: (from: string, to: string) =>
      replaceColorOverrides(basePattern!, editSnapshot.colorOverrides, from, to),
    patternSig,
    setError,
    BEAD_MATCH_METHODS,
    clearAutosave,
  }
}
