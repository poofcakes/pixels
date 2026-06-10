'use client'

import {
  ArrowDown,
  ArrowDownLeft,
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CircleDot,
  FolderOpen,
  ImagePlus,
  Loader2,
  RotateCcw,
  Save,
  Trash2,
  Upload,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { BeadInventoryPicker } from '@/components/BeadInventoryPicker'
import { PatternStudio } from '@/components/PatternStudio'
import { usePatternWorkspace } from '@/hooks/usePatternWorkspace'
import {
  BEAD_PALETTES,
  getBeadPalette,
  type BeadPaletteId,
} from '@/lib/beadPalettes'
import type { PegboardAnchor } from '@/lib/beadPattern'
import {
  loadCompletedCodes,
  saveCompletedCodes,
} from '@/lib/patternCompletedStorage'
import { savePatternPrefs } from '@/lib/beadPatternPreferences'
import { loadEnabledStock, saveEnabledStock } from '@/lib/beadStockStorage'
import { MAX_BEAD_GRID_EDGE } from '@/lib/patternPerformance'
import { cn } from '@/lib/utils'

const EXAMPLE_THUMB_SCALE = 1.5

const EXAMPLE_PATTERNS = [
  { file: 'omok-piece-bloctopus.webp', name: 'Bloctopus', width: 23, height: 22 },
  { file: 'omok-piece-mushroom.webp', name: 'Mushroom', width: 23, height: 21 },
  { file: 'omok-piece-octopus.webp', name: 'Octopus', width: 23, height: 22 },
  { file: 'omok-piece-panda-teddy.webp', name: 'Panda teddy', width: 23, height: 22 },
  { file: 'omok-piece-pig.webp', name: 'Pig', width: 22, height: 22 },
  { file: 'omok-piece-pink-teddy.webp', name: 'Pink teddy', width: 23, height: 22 },
  { file: 'omok-piece-slime.webp', name: 'Slime', width: 23, height: 22 },
  { file: 'omok-piece-trixter.webp', name: 'Trixter', width: 23, height: 22 },
] as const

const PEGBOARD_ANCHORS: PegboardAnchor[] = [
  'top-left',
  'top-center',
  'top-right',
  'middle-left',
  'center',
  'middle-right',
  'bottom-left',
  'bottom-center',
  'bottom-right',
]

const PEGBOARD_ANCHOR_ICONS = {
  'top-left': ArrowUpLeft,
  'top-center': ArrowUp,
  'top-right': ArrowUpRight,
  'middle-left': ArrowLeft,
  center: CircleDot,
  'middle-right': ArrowRight,
  'bottom-left': ArrowDownLeft,
  'bottom-center': ArrowDown,
  'bottom-right': ArrowDownRight,
} satisfies Record<PegboardAnchor, typeof ArrowUp>

const PEGBOARD_SIZE_OPTIONS = [
  { value: 52, labelKey: 'pegboardSizeStandard' },
  { value: 78, labelKey: 'pegboardSizeExtraLarge' },
] as const

type BrandPaletteId = Exclude<BeadPaletteId, 'mixed'>

type BeadPatternGeneratorProps = {
  exampleAssetBasePath?: string
}

type CropDraft = {
  x: number
  y: number
  width: number
  height: number
}

type CropResizeHandle =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'

type CropDrag = {
  mode: 'draw' | 'move' | 'resize'
  handle?: CropResizeHandle
  startX: number
  startY: number
  startCrop: CropDraft
}

const CROP_RESIZE_HANDLES: Array<{
  id: CropResizeHandle
  className: string
}> = [
  { id: 'top-left', className: 'left-0 top-0 -translate-x-1/2 -translate-y-1/2' },
  { id: 'top', className: 'left-1/2 top-0 -translate-x-1/2 -translate-y-1/2' },
  { id: 'top-right', className: 'right-0 top-0 translate-x-1/2 -translate-y-1/2' },
  { id: 'right', className: 'right-0 top-1/2 translate-x-1/2 -translate-y-1/2' },
  { id: 'bottom-right', className: 'bottom-0 right-0 translate-x-1/2 translate-y-1/2' },
  { id: 'bottom', className: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2' },
  { id: 'bottom-left', className: 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2' },
  { id: 'left', className: 'left-0 top-1/2 -translate-x-1/2 -translate-y-1/2' },
]

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

/** Visible default crop (not full bleed) so the box can be moved and resized by dragging. */
function defaultCropDraft(width: number, height: number): CropDraft {
  const inset = 0.08
  const x = Math.round(width * inset)
  const y = Math.round(height * inset)
  return {
    x,
    y,
    width: Math.max(1, Math.round(width * (1 - inset * 2))),
    height: Math.max(1, Math.round(height * (1 - inset * 2))),
  }
}

function cropFromResizeHandle(
  startCrop: CropDraft,
  handle: CropResizeHandle,
  point: { x: number; y: number },
  imageWidth: number,
  imageHeight: number,
): CropDraft {
  const left = startCrop.x
  const top = startCrop.y
  const right = startCrop.x + startCrop.width
  const bottom = startCrop.y + startCrop.height
  let nextLeft = left
  let nextTop = top
  let nextRight = right
  let nextBottom = bottom

  if (handle.includes('left')) nextLeft = clamp(point.x, 0, right - 1)
  if (handle.includes('right')) nextRight = clamp(point.x, left + 1, imageWidth)
  if (handle.includes('top')) nextTop = clamp(point.y, 0, bottom - 1)
  if (handle.includes('bottom')) nextBottom = clamp(point.y, top + 1, imageHeight)

  return {
    x: nextLeft,
    y: nextTop,
    width: Math.max(1, nextRight - nextLeft),
    height: Math.max(1, nextBottom - nextTop),
  }
}

function exampleAssetPath(basePath: string, file: string): string {
  return `${basePath.replace(/\/$/, '')}/${file}`
}

export function BeadPatternGenerator({
  exampleAssetBasePath = '/pixels/examples/omok',
}: BeadPatternGeneratorProps = {}) {
  const ws = usePatternWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const cropImageRef = useRef<HTMLImageElement>(null)
  const [loadingExample, setLoadingExample] = useState<string | null>(null)
  const [targetWidthDraft, setTargetWidthDraft] = useState<number | null>(null)
  const [paletteLimitDraft, setPaletteLimitDraft] = useState<number | null>(null)
  const [blankWidth, setBlankWidth] = useState(32)
  const [blankHeight, setBlankHeight] = useState(32)
  const [cropDraft, setCropDraft] = useState<CropDraft | null>(null)
  const [cropDrag, setCropDrag] = useState<CropDrag | null>(null)

  const onPickExample = useCallback(
    async (example: (typeof EXAMPLE_PATTERNS)[number]) => {
      if (!confirmRegenerateAfterEdits()) return
      setLoadingExample(example.file)
      try {
        const response = await fetch(exampleAssetPath(exampleAssetBasePath, example.file))
        if (!response.ok) throw new Error('fetch failed')
        const blob = await response.blob()
        await ws.onPickFile(new File([blob], example.file, { type: blob.type || 'image/webp' }))
      } catch {
        ws.setError(ws.t('errorLoad'))
      } finally {
        setLoadingExample(null)
      }
    },
    [exampleAssetBasePath, ws],
  )

  const toggleComplete = useCallback(
    (code: string) => {
      ws.setCompletedCodes((prev) => {
        const next = new Set(prev)
        if (next.has(code)) next.delete(code)
        else next.add(code)
        if (ws.patternSig) saveCompletedCodes(ws.patternSig, next)
        return next
      })
    },
    [ws],
  )

  const paletteLimitMax = ws.activePaletteColorCount
  const brandPalettes = BEAD_PALETTES.filter(
    (palette) => palette.id !== 'mixed',
  ) as Array<(typeof BEAD_PALETTES)[number] & { id: BrandPaletteId }>
  const selectedBrandIds: BrandPaletteId[] =
    ws.settings.paletteId === 'mixed'
      ? (ws.settings.mixedBrandIds as BrandPaletteId[])
      : ([ws.settings.paletteId] as BrandPaletteId[])
  const targetWidthSliderValue = targetWidthDraft ?? ws.targetCanvasWidthValue
  const targetWidthDisplayValue =
    targetWidthDraft ?? (ws.settings.targetCanvasWidth ? ws.targetCanvasWidthValue : ws.t('targetWidthAuto'))
  const paletteLimitValue = Math.min(
    paletteLimitMax,
    paletteLimitDraft ?? ws.settings.paletteLimit ?? paletteLimitMax,
  )

  function confirmRegenerateAfterEdits(): boolean {
    if (!ws.pattern || !ws.hasUnsavedStep4Edits) return true
    return window.confirm(ws.t('regenerateEditsWarning'))
  }

  function updateProcessingSettings(updater: Parameters<typeof ws.setSettings>[0]): void {
    if (!confirmRegenerateAfterEdits()) return
    ws.setSettings(updater)
  }

  function updatePegboardSettings(updater: Parameters<typeof ws.setSettings>[0]): void {
    ws.setSettings(updater)
  }

  function commitTargetWidth(value: number | null) {
    if (value === null) return
    const next = Math.max(1, Math.min(value, ws.targetCanvasWidthMax))
    setTargetWidthDraft(null)
    updateProcessingSettings((s) => ({
      ...s,
      targetCanvasWidth: next,
    }))
  }

  function commitPaletteLimit(value: number | null) {
    if (value === null) return
    const next = Math.max(1, Math.min(value, paletteLimitMax))
    setPaletteLimitDraft(null)
    updateProcessingSettings((s) => ({ ...s, paletteLimit: next }))
  }

  function clampBlankSize(value: number): number {
    return Math.max(1, Math.min(MAX_BEAD_GRID_EDGE, Math.floor(value) || 1))
  }

  async function startBlankCanvas(): Promise<void> {
    if (!confirmRegenerateAfterEdits()) return
    await ws.startBlankCanvas(
      clampBlankSize(blankWidth),
      clampBlankSize(blankHeight),
    )
  }

  function openCropDialog(): void {
    if (!ws.file || !ws.fileDimensions) return
    if (!confirmRegenerateAfterEdits()) return
    setCropDraft(defaultCropDraft(ws.fileDimensions.width, ws.fileDimensions.height))
  }

  async function applyCrop(): Promise<void> {
    if (!ws.file || !ws.fileDimensions || !cropDraft) return
    const sourceWidth = ws.fileDimensions.width
    const sourceHeight = ws.fileDimensions.height
    const x = Math.max(0, Math.min(sourceWidth - 1, Math.floor(cropDraft.x)))
    const y = Math.max(0, Math.min(sourceHeight - 1, Math.floor(cropDraft.y)))
    const width = Math.max(1, Math.min(sourceWidth - x, Math.floor(cropDraft.width)))
    const height = Math.max(1, Math.min(sourceHeight - y, Math.floor(cropDraft.height)))
    const bitmap = await createImageBitmap(ws.file)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(bitmap, x, y, width, height, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return
    const croppedName = ws.file.name.replace(/\.[^.]+$/, '') + '-crop.png'
    setCropDraft(null)
    await ws.onPickFile(new File([blob], croppedName, { type: 'image/png' }))
  }

  function cropPointFromEvent(
    event: ReactPointerEvent<HTMLElement> | PointerEvent,
  ): { x: number; y: number } | null {
    if (!ws.fileDimensions) return null
    const image = cropImageRef.current
    if (!image) return null
    const rect = image.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) return null
    return {
      x: clamp(
        ((event.clientX - rect.left) / rect.width) * ws.fileDimensions.width,
        0,
        ws.fileDimensions.width,
      ),
      y: clamp(
        ((event.clientY - rect.top) / rect.height) * ws.fileDimensions.height,
        0,
        ws.fileDimensions.height,
      ),
    }
  }

  function cropResizeHandleFromPoint(point: { x: number; y: number }): CropResizeHandle | null {
    if (!cropDraft || !ws.fileDimensions) return null
    const image = cropImageRef.current
    if (!image) return null
    const rect = image.getBoundingClientRect()
    const tolerancePx = 14
    const toleranceX = (tolerancePx / rect.width) * ws.fileDimensions.width
    const toleranceY = (tolerancePx / rect.height) * ws.fileDimensions.height
    const left = cropDraft.x
    const right = cropDraft.x + cropDraft.width
    const top = cropDraft.y
    const bottom = cropDraft.y + cropDraft.height
    const nearLeft = Math.abs(point.x - left) <= toleranceX
    const nearRight = Math.abs(point.x - right) <= toleranceX
    const nearTop = Math.abs(point.y - top) <= toleranceY
    const nearBottom = Math.abs(point.y - bottom) <= toleranceY
    const withinX = point.x >= left - toleranceX && point.x <= right + toleranceX
    const withinY = point.y >= top - toleranceY && point.y <= bottom + toleranceY

    if (nearLeft && nearTop) return 'top-left'
    if (nearRight && nearTop) return 'top-right'
    if (nearRight && nearBottom) return 'bottom-right'
    if (nearLeft && nearBottom) return 'bottom-left'
    if (nearTop && withinX) return 'top'
    if (nearRight && withinY) return 'right'
    if (nearBottom && withinX) return 'bottom'
    if (nearLeft && withinY) return 'left'
    return null
  }

  function onCropPointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!cropDraft || !ws.fileDimensions) return
    const point = cropPointFromEvent(event)
    if (!point) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const handle = cropResizeHandleFromPoint(point)
    if (handle) {
      setCropDrag({ mode: 'resize', handle, startX: point.x, startY: point.y, startCrop: cropDraft })
      return
    }
    const { width: imgW, height: imgH } = ws.fileDimensions
    const coversFullImage =
      cropDraft.x <= 0 &&
      cropDraft.y <= 0 &&
      cropDraft.width >= imgW - 1 &&
      cropDraft.height >= imgH - 1
    const inside =
      point.x >= cropDraft.x &&
      point.x <= cropDraft.x + cropDraft.width &&
      point.y >= cropDraft.y &&
      point.y <= cropDraft.y + cropDraft.height
    if (inside && !coversFullImage) {
      setCropDrag({ mode: 'move', startX: point.x, startY: point.y, startCrop: cropDraft })
      return
    }
    const next = { x: point.x, y: point.y, width: 1, height: 1 }
    setCropDraft(next)
    setCropDrag({ mode: 'draw', startX: point.x, startY: point.y, startCrop: next })
  }

  useEffect(() => {
    if (!cropDrag || !ws.fileDimensions) return

    const onPointerMove = (event: PointerEvent) => {
      const point = cropPointFromEvent(event)
      if (!point) return
      if (cropDrag.mode === 'move') {
        const dx = point.x - cropDrag.startX
        const dy = point.y - cropDrag.startY
        setCropDraft({
          ...cropDrag.startCrop,
          x: clamp(cropDrag.startCrop.x + dx, 0, ws.fileDimensions!.width - cropDrag.startCrop.width),
          y: clamp(cropDrag.startCrop.y + dy, 0, ws.fileDimensions!.height - cropDrag.startCrop.height),
        })
        return
      }

      if (cropDrag.mode === 'resize' && cropDrag.handle) {
        setCropDraft(
          cropFromResizeHandle(
            cropDrag.startCrop,
            cropDrag.handle,
            point,
            ws.fileDimensions!.width,
            ws.fileDimensions!.height,
          ),
        )
        return
      }

      const x = Math.min(cropDrag.startX, point.x)
      const y = Math.min(cropDrag.startY, point.y)
      setCropDraft({
        x,
        y,
        width: Math.max(1, Math.abs(point.x - cropDrag.startX)),
        height: Math.max(1, Math.abs(point.y - cropDrag.startY)),
      })
    }

    const onPointerUp = () => setCropDrag(null)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }
  }, [cropDrag, ws.fileDimensions])

  useEffect(() => {
    setTargetWidthDraft(null)
  }, [ws.file?.name, ws.file?.lastModified, ws.file?.size])

  useEffect(() => {
    if (!ws.settings.targetCanvasWidth) return
    if (ws.settings.targetCanvasWidth <= ws.targetCanvasWidthMax) return
    setTargetWidthDraft(null)
    ws.setSettings((s) => ({
      ...s,
      targetCanvasWidth: ws.targetCanvasWidthMax,
    }))
  }, [ws, ws.settings.targetCanvasWidth, ws.targetCanvasWidthMax])

  function mixedCodeForBrand(brand: (typeof brandPalettes)[number], code: string): string {
    return `${brand.label} ${code}`
  }

  function preserveViewportAfterStockChange(): void {
    const scrollY = window.scrollY
    const restore = () => {
      const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      window.scrollTo({ top: Math.min(scrollY, maxScroll), behavior: 'auto' })
    }

    requestAnimationFrame(restore)
    window.setTimeout(restore, 0)
  }

  function enabledForBrand(brand: (typeof brandPalettes)[number]): Set<string> {
    if (ws.settings.paletteId === 'mixed') {
      const prefix = `${brand.label} `
      const fromMixed = new Set(
        ws.settings.enabledStock
          .filter((code) => code.startsWith(prefix))
          .map((code) => code.slice(prefix.length)),
      )
      if (fromMixed.size > 0) return fromMixed
    }

    if (ws.settings.paletteId === brand.id) {
      return ws.enabledStockSet
    }

    return loadEnabledStock(brand.id, brand.colors.map((color) => color.code))
  }

  function updateSelectedBrands(nextIds: BrandPaletteId[]): boolean {
    if (!confirmRegenerateAfterEdits()) return false
    const ids = nextIds.length > 0 ? nextIds : (['mard'] as BrandPaletteId[])

    if (ids.length === 1) {
      const brand = getBeadPalette(ids[0])
      const enabled = enabledForBrand(brand as (typeof brandPalettes)[number])
      saveEnabledStock(ids[0], enabled)
      ws.setSettings((s) => ({
        ...s,
        paletteId: ids[0],
        mixedBrandIds: ids,
        enabledStock: [...enabled],
      }))
      return true
    }

    const enabledStock = ids.flatMap((id) => {
      const brand = getBeadPalette(id) as (typeof brandPalettes)[number]
      return [...enabledForBrand(brand)].map((code) => mixedCodeForBrand(brand, code))
    })

    ws.setSettings((s) => ({
      ...s,
      paletteId: 'mixed',
      mixedBrandIds: ids,
      enabledStock,
    }))
    return true
  }

  function updateBrandStock(brand: (typeof brandPalettes)[number], next: Set<string>): boolean {
    if (!confirmRegenerateAfterEdits()) return false
    saveEnabledStock(brand.id, next)
    preserveViewportAfterStockChange()

    if (selectedBrandIds.length === 1) {
      ws.setSettings((s) => ({ ...s, enabledStock: [...next] }))
      return true
    }

    const prefix = `${brand.label} `
    ws.setSettings((s) => ({
      ...s,
      paletteId: 'mixed',
      enabledStock: [
        ...s.enabledStock.filter((code) => !code.startsWith(prefix)),
        ...[...next].map((code) => mixedCodeForBrand(brand, code)),
      ],
    }))
    return true
  }

  const generatorSettingsPanel = (
    <section className="rounded-xl border border-black/10 bg-white p-3 text-sm">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          {ws.t('step3Label')}
        </span>
        <h3 className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
          {ws.t('generatorSettingsTitle')}
        </h3>
      </div>
      <fieldset
        className="group grid gap-3 lg:grid-cols-2"
        disabled={!ws.file}
        aria-busy={ws.loading}
      >
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium">{ws.t('targetWidthLabel')}</span>
              <span className="font-mono text-xs tabular-nums">{targetWidthDisplayValue}</span>
            </div>
            <input
              type="range"
              min={1}
              max={ws.targetCanvasWidthMax}
              value={targetWidthSliderValue}
              onChange={(e) => {
                const v = Number(e.target.value)
                setTargetWidthDraft(Math.max(1, Math.min(v, ws.targetCanvasWidthMax)))
              }}
              onPointerUp={(e) => commitTargetWidth(Number(e.currentTarget.value))}
              onKeyUp={(e) => commitTargetWidth(Number(e.currentTarget.value))}
              onBlur={() => commitTargetWidth(targetWidthDraft)}
              className="accent-[var(--accent)]"
            />
            {ws.outputSizeLabel && (
              <span className="text-xs text-[var(--muted)]">
                {ws.t('outputSize', { size: ws.outputSizeLabel })}
              </span>
            )}
            <span className="text-xs text-[var(--muted)]">{ws.t('targetWidthHint')}</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="font-medium">{ws.t('paletteLimitLabel')}</span>
              <span className="font-mono text-xs">{paletteLimitValue}</span>
            </div>
            <input
              type="range"
              min={20}
              max={paletteLimitMax}
              value={paletteLimitValue}
              onChange={(e) => {
                const v = Number(e.target.value)
                setPaletteLimitDraft(Math.max(1, Math.min(v, paletteLimitMax)))
              }}
              onPointerUp={(e) => commitPaletteLimit(Number(e.currentTarget.value))}
              onKeyUp={(e) => commitPaletteLimit(Number(e.currentTarget.value))}
              onBlur={() => commitPaletteLimit(paletteLimitDraft)}
              className="accent-[var(--accent)]"
            />
            <span className="text-xs text-[var(--muted)]">{ws.t('paletteLimitHint')}</span>
          </label>
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)] lg:grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)]">
            <label className="flex flex-col gap-1.5">
              <span className="font-medium">{ws.t('pixelBlockLabel')}</span>
              <select
                value={
                  ws.settings.pixelBlockSize === 'auto'
                    ? 'auto'
                    : String(ws.settings.pixelBlockSize)
                }
                onChange={(e) => {
                  const v = e.target.value
                  updateProcessingSettings((s) => ({
                    ...s,
                    pixelBlockSize: v === 'auto' ? 'auto' : Number(v),
                  }))
                }}
                className="rounded-md border border-black/15 bg-white px-3 py-2 font-mono text-sm"
              >
                <option value="auto">{ws.t('pixelBlockAuto')}</option>
                <option value="1">{ws.t('pixelBlock1')}</option>
                <option value="2">2×2</option>
                <option value="3">3×3</option>
                <option value="4">4×4</option>
              </select>
              <span className="text-xs leading-snug text-[var(--muted)]">{ws.t('pixelBlockHint')}</span>
            </label>

            <div className="grid gap-1.5 rounded-lg border border-black/10 bg-[#fbf7fb] p-2.5">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={ws.settings.trimTransparent}
                  onChange={(e) =>
                    updateProcessingSettings((s) => ({ ...s, trimTransparent: e.target.checked }))
                  }
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span className="font-medium">{ws.t('trimTransparent')}</span>
              </label>

              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={ws.settings.removeBackground}
                  onChange={(e) =>
                    updateProcessingSettings((s) => ({ ...s, removeBackground: e.target.checked }))
                  }
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span className="font-medium">{ws.t('removeBg')}</span>
              </label>

            </div>
          </div>

          <label className="flex flex-col gap-1.5 group-disabled:opacity-50">
            <span className="font-medium">{ws.t('matchMethodLabel')}</span>
            <select
              value={ws.settings.matchMethod}
              onChange={(e) =>
                updateProcessingSettings((s) => ({
                  ...s,
                  matchMethod: e.target.value as typeof s.matchMethod,
                }))
              }
              className="rounded-md border border-black/15 bg-white px-3 py-2 font-mono text-sm disabled:opacity-50"
            >
              {ws.BEAD_MATCH_METHODS.map((method) => (
                <option key={method} value={method}>
                  {ws.t(`matchMethod.${method}`)}
                </option>
              ))}
            </select>
            <span className="text-xs text-[var(--muted)]">
              {ws.t(`matchMethodHint.${ws.settings.matchMethod}`)}
            </span>
          </label>
        </div>
      </fieldset>
      <p className="mt-3 text-xs text-[var(--muted)]">{ws.t('privacy')}</p>
    </section>
  )

  const pegboardSettingsPanel = (
    <div className="rounded-lg border border-black/10 bg-[#fbf7fb] p-3 text-sm">
      <fieldset className="grid items-start gap-4 sm:grid-cols-[minmax(0,1fr)_auto]" disabled={!ws.file} aria-busy={ws.loading}>
        <div className="flex min-w-0 flex-col gap-3">
          <label className="flex min-w-0 cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={Boolean(ws.settings.pegboardSize)}
              onChange={(e) =>
                updatePegboardSettings((s) => {
                  const enabling = e.target.checked && !s.pegboardSize
                  return {
                    ...s,
                    pegboardSize: e.target.checked ? (s.pegboardSize ?? 52) : null,
                    cellPx: enabling ? Math.max(1, Math.round(s.cellPx * 0.75)) : s.cellPx,
                  }
                })
              }
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="block font-medium">{ws.t('pegboardFit')}</span>
              <span className="block text-xs leading-snug text-[var(--muted)]">
                {ws.t('pegboardFitHint')}
              </span>
            </span>
          </label>

          <label className="flex max-w-56 flex-col gap-1 text-xs text-[var(--muted)]">
            <span>{ws.t('pegboardSizeLabel')}</span>
            <select
              value={ws.settings.pegboardSize ?? 52}
              disabled={!ws.settings.pegboardSize}
              onChange={(e) => {
                const size = Number(e.target.value) || 52
                updatePegboardSettings((s) => ({ ...s, pegboardSize: size }))
              }}
              className="w-full rounded-md border border-black/15 bg-white px-2 py-1.5 font-mono text-xs text-[var(--foreground)] disabled:opacity-50"
            >
              {PEGBOARD_SIZE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {ws.t(option.labelKey)}
                </option>
              ))}
            </select>
          </label>
          {ws.boardLayoutLabel && (
            <span className="w-fit rounded-full bg-white px-2 py-1 text-xs text-[var(--muted)]">
              {ws.t('pegboardLayout', { layout: ws.boardLayoutLabel })}
            </span>
          )}
        </div>

        <div className="flex flex-col items-start gap-2 text-xs text-[var(--muted)] sm:items-end">
          <div className="grid w-fit grid-cols-3 gap-1 rounded-lg border border-black/10 bg-white/70 p-1 shadow-inner">
              {PEGBOARD_ANCHORS.map((anchor) => {
                const active = (ws.settings.pegboardAnchor ?? 'top-left') === anchor
                const Icon = PEGBOARD_ANCHOR_ICONS[anchor]
                return (
                  <button
                    key={anchor}
                    type="button"
                    disabled={!ws.settings.pegboardSize}
                    onClick={() =>
                      updatePegboardSettings((s) => ({
                        ...s,
                        pegboardAnchor: anchor,
                      }))
                    }
                    className={cn(
                      'flex size-7 items-center justify-center rounded-md border text-[10px] transition-colors disabled:opacity-50',
                      active
                        ? 'border-[#34205f] bg-[#34205f] text-white shadow-sm'
                        : 'border-black/10 bg-white text-[var(--muted)] hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/10 hover:text-[#34205f]',
                    )}
                    aria-label={ws.t(`pegboardAnchor.${anchor}`)}
                    title={ws.t(`pegboardAnchor.${anchor}`)}
                  >
                    <Icon className="size-3.5" strokeWidth={2.4} />
                  </button>
                )
              })}
          </div>
          <span className="max-w-40 leading-snug sm:text-right">{ws.t('pegboardAnchorHint')}</span>
        </div>
      </fieldset>
    </div>
  )

  return (
    <div className="flex flex-col gap-8">
      <header className="flex max-w-3xl flex-col gap-3">
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--accent)]">
          {ws.t('eyebrow')}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">
          {ws.t('title')}
        </h1>
        <p className="max-w-2xl text-[var(--muted)]">{ws.t('subtitle')}</p>
      </header>

      <div className="grid gap-8 xl:grid-cols-[minmax(0,320px)_1fr]">
        <aside className="flex flex-col gap-5">
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.heic,.heif"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              if (file && confirmRegenerateAfterEdits()) {
                void ws.onPickFile(file).catch(() => {
                  ws.setError(ws.t('errorLoad'))
                })
              }
              e.target.value = ''
            }}
          />
          <input
            ref={ws.importProjectRef}
            type="file"
            accept="application/json,.poofpixels.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f && confirmRegenerateAfterEdits()) void ws.importProject(f)
              e.target.value = ''
            }}
          />

          <section className="flex flex-col gap-4 rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm">
            <div className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                {ws.t('step1Label')}
              </span>
              <span className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
                {ws.t('step1Title')}
              </span>
            </div>

            {!ws.file ? (
              <>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-black/15 bg-white/50 px-6 py-10 text-center transition-colors hover:border-[var(--accent)] hover:bg-white"
                >
                  <ImagePlus className="size-8 text-[var(--accent)]" />
                  <span className="font-medium">{ws.t('uploadTitle')}</span>
                  <span className="text-sm text-[var(--muted)]">{ws.t('uploadHint')}</span>
                </button>
                <div className="rounded-xl border border-black/10 bg-[#fbf7fb] p-3">
                  <div className="flex flex-col gap-2">
                    <div>
                      <h2 className="text-sm font-medium">{ws.t('blankCanvasTitle')}</h2>
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        {ws.t('blankCanvasHint')}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex w-24 flex-col gap-1 text-xs text-[var(--muted)]">
                        {ws.t('blankCanvasWidth')}
                        <input
                          type="number"
                          min={1}
                          max={MAX_BEAD_GRID_EDGE}
                          value={blankWidth}
                          onChange={(e) => setBlankWidth(clampBlankSize(Number(e.target.value)))}
                          className="rounded-md border border-black/15 bg-white px-2 py-1.5 font-mono text-xs text-[var(--foreground)]"
                        />
                      </label>
                      <label className="flex w-24 flex-col gap-1 text-xs text-[var(--muted)]">
                        {ws.t('blankCanvasHeight')}
                        <input
                          type="number"
                          min={1}
                          max={MAX_BEAD_GRID_EDGE}
                          value={blankHeight}
                          onChange={(e) => setBlankHeight(clampBlankSize(Number(e.target.value)))}
                          className="rounded-md border border-black/15 bg-white px-2 py-1.5 font-mono text-xs text-[var(--foreground)]"
                        />
                      </label>
                      <button
                        type="button"
                        onClick={() => void startBlankCanvas()}
                        className="rounded-md bg-[#34205f] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                      >
                        {ws.t('blankCanvasAction')}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1 text-xs font-medium text-[var(--muted)]">
                  {ws.t('projectNameLabel')}
                  <input
                    type="text"
                    value={ws.projectName}
                    onChange={(e) => ws.setProjectName(e.target.value)}
                    placeholder={ws.t('projectNamePlaceholder')}
                    className="rounded-lg border border-black/15 bg-white px-3 py-2 text-sm font-medium text-[var(--foreground)]"
                  />
                </label>

                {ws.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ws.previewUrl}
                    alt=""
                    className="mx-auto max-h-40 rounded-lg border border-black/10 bg-white/60 object-contain p-2"
                  />
                )}
                <p className="break-words text-center text-xs text-[var(--muted)]">
                  {ws.t('selectedImageMeta', {
                    name: ws.file.name,
                    width: ws.fileDimensions?.width ?? '?',
                    height: ws.fileDimensions?.height ?? '?',
                  })}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="rounded-md border border-black/15 bg-white px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-black/[0.04]"
                  >
                    {ws.t('replaceImage')}
                  </button>
                  <button
                    type="button"
                    onClick={openCropDialog}
                    className="rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent)]/15"
                  >
                    {ws.t('cropImage')}
                  </button>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
            <div>
              <h2 className="text-sm font-medium">{ws.t('examplesTitle')}</h2>
              <p className="mt-0.5 text-xs text-[var(--muted)]">{ws.t('examplesHint')}</p>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {EXAMPLE_PATTERNS.map((example) => {
                const src = exampleAssetPath(exampleAssetBasePath, example.file)
                const busy = loadingExample === example.file

                return (
                  <button
                    key={example.file}
                    type="button"
                    onClick={() => void onPickExample(example)}
                    disabled={Boolean(loadingExample)}
                    aria-label={ws.t('exampleLoad', { name: example.name })}
                    className="group flex min-w-0 flex-col items-center gap-0.5 rounded-md border border-black/10 bg-white/70 p-0.5 transition-colors hover:border-[var(--accent)] hover:bg-white disabled:cursor-wait disabled:opacity-70"
                    title={example.name}
                  >
                    <span
                      className="flex items-center justify-center overflow-hidden rounded bg-white/60 p-1"
                      style={{
                        width: example.width * EXAMPLE_THUMB_SCALE + 8,
                        height: example.height * EXAMPLE_THUMB_SCALE + 8,
                        minWidth: example.width * EXAMPLE_THUMB_SCALE + 8,
                        minHeight: example.height * EXAMPLE_THUMB_SCALE + 8,
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        width={example.width}
                        height={example.height}
                        className="block shrink-0 [image-rendering:pixelated] [image-rendering:crisp-edges]"
                        style={{
                          width: example.width * EXAMPLE_THUMB_SCALE,
                          height: example.height * EXAMPLE_THUMB_SCALE,
                        }}
                        loading="lazy"
                      />
                    </span>
                    <span className="flex min-h-[2.3em] w-full items-center justify-center gap-0.5 px-0.5 text-center text-[8px] font-normal leading-[1.15] text-[var(--muted)]">
                      {busy && <Loader2 className="size-2.5 shrink-0 animate-spin" />}
                      <span className="line-clamp-2 break-words">{example.name}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            </div>

            <div className="flex flex-col gap-2">
            {ws.showRestoreBanner && (
              <button
                type="button"
                onClick={() => {
                  if (confirmRegenerateAfterEdits()) void ws.restoreSession()
                }}
                className="inline-flex items-center gap-1.5 rounded-md bg-[#34205f] px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-90"
              >
                <RotateCcw className="size-3.5" />
                {ws.t('restoreSessionAction')}
              </button>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void ws.saveCurrentProject()}
                disabled={!ws.pattern}
                className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-2.5 py-1.5 text-xs hover:bg-black/[0.04] disabled:opacity-50"
              >
                <Save className="size-3.5" />
                {ws.t('saveProject')}
              </button>
            </div>
            </div>

            {ws.projects.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                {ws.t('projectsTitle')}
              </span>
              <ul className="max-h-56 overflow-y-auto rounded-md border border-black/10 bg-white/80 text-sm">
                {ws.projects.map((p) => (
                  <li key={p.id} className="flex items-stretch">
                    <button
                      type="button"
                      onClick={() => {
                        if (confirmRegenerateAfterEdits()) void ws.openProject(p)
                      }}
                      className={cn(
                        'flex min-w-0 flex-1 items-center gap-2 px-2 py-1.5 text-left hover:bg-black/[0.04]',
                        ws.activeProjectId === p.id && 'bg-[var(--accent)]/10 font-medium',
                      )}
                    >
                      {p.thumbnailDataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.thumbnailDataUrl}
                          alt=""
                          className="size-10 shrink-0 rounded border border-black/10 bg-[#1a1814] object-contain"
                        />
                      ) : (
                        <span className="size-10 shrink-0 rounded border border-dashed border-black/15 bg-black/[0.03]" />
                      )}
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void ws.deleteProject(p)}
                      className="flex w-9 shrink-0 items-center justify-center border-l border-black/10 text-[var(--muted)] hover:bg-red-50 hover:text-red-700"
                      aria-label={ws.t('deleteProject', { name: p.name })}
                      title={ws.t('deleteProject', { name: p.name })}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-col gap-2 pt-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void ws.exportProject()}
                    disabled={!ws.pattern && ws.projects.length === 0}
                    className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-2.5 py-1.5 text-xs hover:bg-black/[0.04] disabled:opacity-50"
                  >
                    <Upload className="size-3.5" />
                    {ws.t('exportProject')}
                  </button>
                  <button
                    type="button"
                    onClick={() => ws.importProjectRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-2.5 py-1.5 text-xs hover:bg-black/[0.04]"
                  >
                    <FolderOpen className="size-3.5" />
                    {ws.t('importProject')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void ws.deleteAllProjects()}
                    className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1.5 text-xs text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="size-3.5" />
                    {ws.t('deleteAllProjects')}
                  </button>
                </div>
                <p className="text-xs text-[var(--muted)]">{ws.t('exportProjectHint')}</p>
              </div>
            </div>
            )}
          </section>

          <section className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm">
            <div className="mb-3 flex min-w-0 flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
                {ws.t('step2Label')}
              </span>
              <span className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
                {ws.t('inventoryTitle')}
              </span>
              <span className="text-xs text-[var(--muted)]">
                {selectedBrandIds.length === 1
                  ? ws.t('inventorySingleBrandHint')
                  : ws.t('inventoryMixedBrandHint', { count: selectedBrandIds.length })}
              </span>
            </div>

            <div className="grid gap-4 text-sm">
              <p className="text-xs text-[var(--muted)]">{ws.t('inventoryHint')}</p>

              <div className="flex flex-col gap-2">
                <span className="font-medium">{ws.t('inventoryBrandsLabel')}</span>
                <div className="flex flex-wrap gap-2">
                  {brandPalettes.map((brand) => {
                    const checked = selectedBrandIds.includes(brand.id)
                    return (
                      <label
                        key={brand.id}
                        className={cn(
                          'flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors',
                          checked
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                            : 'border-black/10 bg-white text-[var(--muted)]',
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const next = new Set<BrandPaletteId>(selectedBrandIds)
                            if (e.target.checked) next.add(brand.id)
                            else next.delete(brand.id)
                            if (updateSelectedBrands([...next])) {
                              ws.resetEdits()
                              ws.setSelectedCode(null)
                            }
                          }}
                          className="accent-[var(--accent)]"
                        />
                        {brand.label}
                        <span className="font-mono text-[10px] opacity-70">
                          {brand.colors.length}
                        </span>
                      </label>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-3">
                {selectedBrandIds.map((id) => {
                  const brand = getBeadPalette(id) as (typeof brandPalettes)[number]
                  return (
                    <BeadInventoryPicker
                      key={brand.id}
                      paletteId={brand.id}
                      title={ws.t('brandStockTitle', { brand: brand.label })}
                      enabled={enabledForBrand(brand)}
                      mardCatalogId={ws.settings.mardStockCatalogId}
                      onMardCatalogChange={(catalogId) => {
                        ws.setSettings((s) => ({ ...s, mardStockCatalogId: catalogId }))
                        savePatternPrefs({ mardStockCatalogId: catalogId })
                      }}
                      onEnabledChange={(next) => {
                        updateBrandStock(brand, next)
                      }}
                    />
                  )
                })}
              </div>

              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  checked={ws.settings.restrictToStock}
                  onChange={(e) => {
                    if (!confirmRegenerateAfterEdits()) return
                    ws.setSettings((s) => ({ ...s, restrictToStock: e.target.checked }))
                    savePatternPrefs({ restrictToStock: e.target.checked })
                  }}
                  className="mt-0.5 accent-[var(--accent)]"
                />
                <span>
                  <span className="font-medium">{ws.t('restrictToStock')}</span>
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {ws.t('restrictToStockHint')}
                  </span>
                </span>
              </label>
            </div>
          </section>

        </aside>

        <div className="min-w-0">
          {ws.error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p>{ws.error}</p>
              {ws.errorDetails && (
                <p className="mt-1 break-words font-mono text-xs text-red-800/80">
                  {ws.errorDetails}
                </p>
              )}
            </div>
          )}
          {!ws.pattern && !ws.loading && !ws.error && (
            <p className="text-[var(--muted)]">{ws.t('emptyPattern')}</p>
          )}
          {ws.pattern && ws.basePattern && (
            <PatternStudio
              pattern={ws.pattern}
              basePattern={ws.basePattern}
              palette={ws.palette}
              projectName={ws.projectName}
              gridDisplay={ws.gridDisplay}
              cellPx={ws.settings.cellPx}
              onCellPxChange={ws.setCellPx}
              onAutoCellPxChange={ws.setAutoCellPx}
              showCodes={ws.settings.showCodes}
              onShowCodesChange={(v) => ws.setSettings((s) => ({ ...s, showCodes: v }))}
              showGridGuidesOnTop={ws.settings.showGridGuidesOnTop}
              onShowGridGuidesOnTopChange={(v) =>
                ws.setSettings((s) => ({ ...s, showGridGuidesOnTop: v }))
              }
              includePoofPixelsHandle={Boolean(ws.settings.includePoofPixelsHandle)}
              onIncludePoofPixelsHandleChange={(v) =>
                ws.setSettings((s) => ({ ...s, includePoofPixelsHandle: v }))
              }
              completedCodes={ws.completedCodes}
              selectedCode={ws.selectedCode}
              onSelectCode={ws.setSelectedCode}
              brushCode={ws.brushCode}
              brushHex={ws.brushHex}
              onBrushCodeChange={ws.setBrushCode}
              statRows={ws.statRows}
              statsSortMode={ws.statsSortMode}
              onStatsSortModeChange={ws.setStatsSortMode}
              hovered={ws.hovered}
              onHover={ws.setHovered}
              hoveredCode={
                ws.hovered && ws.pattern
                  ? (ws.pattern.cells.find(
                      (c) => c.x === ws.hovered!.x && c.y === ws.hovered!.y,
                    )?.bead?.code ?? null)
                  : null
              }
              colorOverrides={ws.editSnapshot.colorOverrides}
              hasEdits={ws.hasStep4Edits}
              onPushOverrides={ws.pushEdit}
              onUndo={ws.undoEdits}
              onResetEdits={ws.resetEdits}
              canUndo={ws.canUndoEdits}
              onPaintCell={ws.onPaintCell}
              onMirrorHorizontal={ws.mirrorHorizontal}
              onExtendCanvas={ws.extendPatternCanvas}
              onPaintStrokeStart={ws.beginEditStroke}
              onPaintStrokeEnd={ws.endEditStroke}
              onCopyBreakdown={() => void ws.copyBreakdown()}
              onToggleComplete={toggleComplete}
              generatorSettingsPanel={generatorSettingsPanel}
              pegboardSettingsPanel={pegboardSettingsPanel}
              loading={ws.loading}
            />
          )}
        </div>
      </div>

      {cropDraft && ws.fileDimensions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal
          aria-labelledby="crop-image-title"
          onClick={() => setCropDraft(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col gap-1">
              <h2 id="crop-image-title" className="text-lg font-semibold text-[#34205f]">
                {ws.t('cropImageTitle')}
              </h2>
              <p className="text-sm text-[var(--muted)]">
                {ws.t('cropImageHint', {
                  width: ws.fileDimensions.width,
                  height: ws.fileDimensions.height,
                })}
              </p>
            </div>
            <div
              className="mt-4 flex max-h-[60vh] justify-center overflow-auto rounded-xl border border-black/10 bg-black/[0.03]"
            >
              <div
                className="relative inline-block max-w-full touch-none select-none cursor-crosshair"
                onPointerDown={onCropPointerDown}
              >
                {ws.previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    ref={cropImageRef}
                    src={ws.previewUrl}
                    alt=""
                    draggable={false}
                    className="block max-h-[60vh] max-w-full object-contain"
                  />
                )}
                <div className="pointer-events-none absolute inset-0">
                  <div
                    className="absolute box-border border-2 border-white bg-white/10 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] outline outline-1 outline-black/50"
                    style={{
                      left: `${(cropDraft.x / ws.fileDimensions.width) * 100}%`,
                      top: `${(cropDraft.y / ws.fileDimensions.height) * 100}%`,
                      width: `${(cropDraft.width / ws.fileDimensions.width) * 100}%`,
                      height: `${(cropDraft.height / ws.fileDimensions.height) * 100}%`,
                    }}
                  >
                    {CROP_RESIZE_HANDLES.map((handle) => (
                      <span
                        key={handle.id}
                        className={`absolute size-3 rounded-full border border-[#34205f] bg-white shadow ${handle.className}`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              {ws.t('cropSelection', {
                width: Math.round(cropDraft.width),
                height: Math.round(cropDraft.height),
              })}
            </p>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() =>
                  setCropDraft({
                    x: 0,
                    y: 0,
                    width: ws.fileDimensions!.width,
                    height: ws.fileDimensions!.height,
                  })
                }
                className="rounded-md border border-black/15 px-3 py-2 text-sm hover:bg-black/[0.04]"
              >
                {ws.t('cropFullImage')}
              </button>
              <button
                type="button"
                onClick={() => setCropDraft(null)}
                className="rounded-md border border-black/15 px-3 py-2 text-sm hover:bg-black/[0.04]"
              >
                {ws.t('replaceCancel')}
              </button>
              <button
                type="button"
                onClick={() => void applyCrop()}
                className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:opacity-90"
              >
                {ws.t('applyCrop')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
