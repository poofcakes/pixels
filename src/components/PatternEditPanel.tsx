'use client'

import { Undo2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { BeadPattern } from '@/lib/beadPattern'
import { getBeadPalette } from '@/lib/beadPalettes'
import {
  hasPatternEdits,
  mergeSimilarColorOverrides,
  replaceColorOverrides,
} from '@/lib/patternEdits'
type PatternEditPanelProps = {
  basePattern: BeadPattern
  colorOverrides: Record<string, string>
  onPushOverrides: (overrides: Record<string, string>) => void
  onUndo: () => void
  onReset: () => void
  canUndo: boolean
  selectedCode: string | null
  onSelectCode: (code: string | null) => void
}

export function PatternEditPanel({
  basePattern,
  colorOverrides,
  onPushOverrides,
  onUndo,
  onReset,
  canUndo,
  selectedCode,
  onSelectCode,
}: PatternEditPanelProps) {
  const t = useTranslations('pattern')
  const [mergeThreshold, setMergeThreshold] = useState(10)
  const [replaceTarget, setReplaceTarget] = useState('')

  const edited = hasPatternEdits(colorOverrides)
  const paletteColors = getBeadPalette(basePattern.paletteId).colors

  function handleReplace() {
    if (!selectedCode || !replaceTarget) return
    onPushOverrides(
      replaceColorOverrides(basePattern, colorOverrides, selectedCode, replaceTarget),
    )
    setReplaceTarget('')
    onSelectCode(null)
  }

  return (
    <div className="flex flex-col gap-4 border-t border-black/10 pt-4">
      <div>
        <h3 className="font-medium">{t('editTitle')}</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">{t('editHint')}</p>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="font-medium">{t('mergeThreshold')}</span>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={2}
            max={25}
            value={mergeThreshold}
            onChange={(e) => setMergeThreshold(Number(e.target.value))}
            className="flex-1 accent-[var(--accent)]"
          />
          <span className="w-12 font-mono text-right text-xs tabular-nums">ΔE {mergeThreshold}</span>
        </div>
        <button
          type="button"
          onClick={() =>
            onPushOverrides(
              mergeSimilarColorOverrides(basePattern, colorOverrides, mergeThreshold),
            )
          }
          className="rounded-md border border-black/15 px-3 py-2 text-left hover:bg-black/5"
        >
          {t('mergeSimilar')}
        </button>
        <span className="text-xs text-[var(--muted)]">{t('mergeSimilarHint')}</span>
      </label>

      {selectedCode && (
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-3">
          <p className="text-sm">
            {t('replaceSelected')}{' '}
            <span className="font-mono font-semibold">{selectedCode}</span>
          </p>
          <div className="flex gap-2">
            <select
              value={replaceTarget}
              onChange={(e) => setReplaceTarget(e.target.value)}
              className="min-w-0 flex-1 rounded-md border border-black/15 bg-white px-2 py-1.5 font-mono text-xs"
            >
              <option value="">{t('pickReplacement')}</option>
              {paletteColors.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.hex}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!replaceTarget}
              onClick={handleReplace}
              className="shrink-0 rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
            >
              {t('replaceApply')}
            </button>
          </div>
          <button
            type="button"
            onClick={() => onSelectCode(null)}
            className="text-xs text-[var(--muted)] hover:underline"
          >
            {t('replaceCancel')}
          </button>
        </div>
      )}

      {(edited || canUndo) && (
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onUndo}
            disabled={!canUndo}
            aria-label={t('undoEdit')}
            className="inline-flex items-center gap-1.5 text-sm text-[var(--foreground)] hover:underline disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Undo2 className="size-3.5" />
            {t('undoEdit')}
          </button>
          {edited && (
            <button
              type="button"
              onClick={onReset}
              className="text-sm text-[var(--accent)] hover:underline"
            >
              {t('resetEdits')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
