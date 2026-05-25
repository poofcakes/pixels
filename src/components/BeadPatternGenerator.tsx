'use client'

import { FolderOpen, ImagePlus, Loader2, RotateCcw, Save, Trash2, Upload } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

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
import { hasAnyEdits } from '@/lib/patternEdits'
import { savePatternPrefs } from '@/lib/beadPatternPreferences'
import { loadEnabledStock, saveEnabledStock } from '@/lib/beadStockStorage'
import { cn } from '@/lib/utils'

const EXAMPLE_PATTERNS = [
  { file: 'omok-piece-bloctopus.webp', name: 'Bloctopus' },
  { file: 'omok-piece-mushroom.webp', name: 'Mushroom' },
  { file: 'omok-piece-octopus.webp', name: 'Octopus' },
  { file: 'omok-piece-panda-teddy.webp', name: 'Panda teddy' },
  { file: 'omok-piece-pig.webp', name: 'Pig' },
  { file: 'omok-piece-pink-teddy.webp', name: 'Pink teddy' },
  { file: 'omok-piece-slime.webp', name: 'Slime' },
  { file: 'omok-piece-trixter.webp', name: 'Trixter' },
] as const

const PEGBOARD_ANCHORS: PegboardAnchor[] = [
  'center',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right',
]

type BrandPaletteId = Exclude<BeadPaletteId, 'mixed'>

type BeadPatternGeneratorProps = {
  exampleAssetBasePath?: string
}

function exampleAssetPath(basePath: string, file: string): string {
  return `${basePath.replace(/\/$/, '')}/${file}`
}

export function BeadPatternGenerator({
  exampleAssetBasePath = '/pixels/examples/omok',
}: BeadPatternGeneratorProps = {}) {
  const ws = usePatternWorkspace()
  const inputRef = useRef<HTMLInputElement>(null)
  const [loadingExample, setLoadingExample] = useState<string | null>(null)
  const [targetWidthDraft, setTargetWidthDraft] = useState<number | null>(null)
  const [paletteLimitDraft, setPaletteLimitDraft] = useState<number | null>(null)

  const onPickExample = useCallback(
    async (example: (typeof EXAMPLE_PATTERNS)[number]) => {
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
  const selectedBrandIds =
    ws.settings.paletteId === 'mixed'
      ? ws.settings.mixedBrandIds
      : ([ws.settings.paletteId] as BrandPaletteId[])
  const targetWidthSliderValue = targetWidthDraft ?? ws.targetCanvasWidthValue
  const targetWidthDisplayValue =
    targetWidthDraft ?? (ws.settings.targetCanvasWidth ? ws.targetCanvasWidthValue : ws.t('targetWidthAuto'))
  const paletteLimitValue = Math.min(
    paletteLimitMax,
    paletteLimitDraft ?? ws.settings.paletteLimit ?? paletteLimitMax,
  )

  function confirmRegenerateAfterEdits(): boolean {
    if (!ws.pattern || !hasAnyEdits(ws.editSnapshot)) return true
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
      pixelBlockSize: 'auto',
    }))
  }

  function commitPaletteLimit(value: number | null) {
    if (value === null) return
    const next = Math.max(1, Math.min(value, paletteLimitMax))
    setPaletteLimitDraft(null)
    updateProcessingSettings((s) => ({ ...s, paletteLimit: next }))
  }

  useEffect(() => {
    if (!ws.settings.targetCanvasWidth) return
    if (ws.settings.targetCanvasWidth <= ws.targetCanvasWidthMax) return
    setTargetWidthDraft(null)
    ws.setSettings((s) => ({
      ...s,
      targetCanvasWidth: ws.targetCanvasWidthMax,
      pixelBlockSize: 'auto',
    }))
  }, [ws, ws.settings.targetCanvasWidth, ws.targetCanvasWidthMax])

  function mixedCodeForBrand(brand: (typeof brandPalettes)[number], code: string): string {
    return `${brand.label} ${code}`
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

  const canvasSettingsPanel = (
    <section className="rounded-xl border border-black/10 bg-white/70 p-3 text-sm">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[#34205f]">
        {ws.t('canvasSettingsTitle')}
      </h3>
      <fieldset className="group flex flex-col gap-4" disabled={!ws.file || ws.loading}>
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
          {ws.boardLayoutLabel && (
            <span className="text-xs text-[var(--muted)]">
              {ws.t('pegboardLayout', { layout: ws.boardLayoutLabel })}
            </span>
          )}
          <span className="text-xs text-[var(--muted)]">{ws.t('targetWidthHint')}</span>
        </label>

        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={Boolean(ws.settings.pegboardSize)}
              onChange={(e) =>
                updatePegboardSettings((s) => ({
                  ...s,
                  pegboardSize: e.target.checked ? (s.pegboardSize ?? 52) : null,
                }))
              }
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="block font-medium">{ws.t('pegboardFit')}</span>
              <span className="block text-xs text-[var(--muted)]">{ws.t('pegboardFitHint')}</span>
            </span>
          </label>
          <label className="ml-6 flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>{ws.t('pegboardSizeLabel')}</span>
            <input
              type="number"
              min={1}
              max={200}
              value={ws.settings.pegboardSize ?? 52}
              disabled={!ws.settings.pegboardSize}
              onChange={(e) => {
                const size = Math.max(1, Math.min(200, Number(e.target.value) || 52))
                updatePegboardSettings((s) => ({ ...s, pegboardSize: size }))
              }}
              className="w-20 rounded-md border border-black/15 bg-white px-2 py-1 font-mono text-xs text-[var(--foreground)] disabled:opacity-50"
            />
          </label>
          <label className="ml-6 flex items-center gap-2 text-xs text-[var(--muted)]">
            <span>{ws.t('pegboardAnchorLabel')}</span>
            <select
              value={ws.settings.pegboardAnchor ?? 'center'}
              disabled={!ws.settings.pegboardSize}
              onChange={(e) =>
                updatePegboardSettings((s) => ({
                  ...s,
                  pegboardAnchor: e.target.value as PegboardAnchor,
                }))
              }
              className="min-w-32 rounded-md border border-black/15 bg-white px-2 py-1 text-xs text-[var(--foreground)] disabled:opacity-50"
            >
              {PEGBOARD_ANCHORS.map((anchor) => (
                <option key={anchor} value={anchor}>
                  {ws.t(`pegboardAnchor.${anchor}`)}
                </option>
              ))}
            </select>
          </label>
        </div>

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

        <label className="flex flex-col gap-1.5">
          <span className="font-medium">{ws.t('pixelBlockLabel')}</span>
          <select
            value={
              ws.settings.targetCanvasWidth
                ? 'auto'
                : ws.settings.pixelBlockSize === 'auto'
                  ? 'auto'
                  : String(ws.settings.pixelBlockSize)
            }
            disabled={Boolean(ws.settings.targetCanvasWidth)}
            onChange={(e) => {
              const v = e.target.value
              updateProcessingSettings((s) => ({
                ...s,
                pixelBlockSize: v === 'auto' ? 'auto' : Number(v),
              }))
            }}
            className="rounded-md border border-black/15 bg-white px-3 py-2 font-mono text-sm disabled:opacity-50"
          >
            <option value="auto">{ws.t('pixelBlockAuto')}</option>
            <option value="1">{ws.t('pixelBlock1')}</option>
            <option value="2">2×2</option>
            <option value="3">3×3</option>
            <option value="4">4×4</option>
          </select>
        </label>

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
        </label>

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
      </fieldset>
      <p className="mt-4 text-xs text-[var(--muted)]">{ws.t('privacy')}</p>
    </section>
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
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => void ws.onPickFile(e.target.files?.[0] ?? null)}
          />
          <input
            ref={ws.importProjectRef}
            type="file"
            accept="application/json,.poofpixels.json"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void ws.importProject(f)
              e.target.value = ''
            }}
          />

          {!ws.file ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-black/15 bg-white/50 px-6 py-10 text-center transition-colors hover:border-[var(--accent)] hover:bg-white"
            >
              <ImagePlus className="size-8 text-[var(--accent)]" />
              <span className="font-medium">{ws.t('uploadTitle')}</span>
              <span className="text-sm text-[var(--muted)]">{ws.t('uploadHint')}</span>
            </button>
          ) : (
            <div className="flex flex-col gap-3">
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
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="text-sm text-[var(--accent)] hover:underline"
              >
                {ws.t('replaceImage')}
              </button>
            </div>
          )}

          <section className="flex flex-col gap-2">
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
                    <span className="flex size-9 items-center justify-center overflow-hidden rounded bg-white/60 p-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={src}
                        alt=""
                        className="max-h-full max-w-full object-contain transition-transform group-hover:scale-105"
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
          </section>

          <div className="flex flex-col gap-2">
            {ws.showRestoreBanner && (
              <button
                type="button"
                onClick={() => void ws.restoreSession()}
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
            </div>
            <p className="text-xs text-[var(--muted)]">{ws.t('exportProjectHint')}</p>
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
                      onClick={() => void ws.openProject(p)}
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
            </div>
          )}

          <section className="rounded-2xl border border-black/10 bg-white/80 p-4 shadow-sm">
            <div className="mb-3 flex min-w-0 flex-col gap-1">
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
                            const next = new Set(selectedBrandIds)
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
          {ws.error && <p className="mb-3 text-sm text-red-700">{ws.error}</p>}
          {!ws.pattern && !ws.loading && !ws.error && (
            <p className="text-[var(--muted)]">{ws.t('emptyPattern')}</p>
          )}
          {ws.pattern && ws.basePattern && (
            <PatternStudio
              pattern={ws.pattern}
              basePattern={ws.basePattern}
              palette={ws.palette}
              projectName={ws.projectName}
              onProjectNameChange={ws.setProjectName}
              gridDisplay={ws.gridDisplay}
              usePaletteColors={ws.settings.usePaletteColors}
              cellPx={ws.settings.cellPx}
              onCellPxChange={(px) => ws.setSettings((s) => ({ ...s, cellPx: px }))}
              usePaletteColorsToggle={ws.settings.usePaletteColors}
              onUsePaletteColorsChange={(v) => {
                ws.setSettings((s) => ({ ...s, usePaletteColors: v }))
                savePatternPrefs({ usePaletteColors: v })
              }}
              showCodes={ws.settings.showCodes}
              onShowCodesChange={(v) => ws.setSettings((s) => ({ ...s, showCodes: v }))}
              showGridGuidesOnTop={ws.settings.showGridGuidesOnTop}
              onShowGridGuidesOnTopChange={(v) =>
                ws.setSettings((s) => ({ ...s, showGridGuidesOnTop: v }))
              }
              completedCodes={ws.completedCodes}
              selectedCode={ws.selectedCode}
              onSelectCode={ws.setSelectedCode}
              brushCode={ws.brushCode}
              brushHex={ws.brushHex}
              onBrushCodeChange={ws.setBrushCode}
              statRows={ws.statRows}
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
              onPushOverrides={ws.pushEdit}
              onUndo={ws.undoEdits}
              onResetEdits={ws.resetEdits}
              canUndo={ws.canUndoEdits}
              onPaintCell={ws.onPaintCell}
              onMirrorHorizontal={ws.mirrorHorizontal}
              onPaintStrokeStart={ws.beginEditStroke}
              onPaintStrokeEnd={ws.endEditStroke}
              onCopyBreakdown={() => void ws.copyBreakdown()}
              onToggleComplete={toggleComplete}
              canvasSettingsPanel={canvasSettingsPanel}
              loading={ws.loading}
            />
          )}
        </div>
      </div>
    </div>
  )
}
