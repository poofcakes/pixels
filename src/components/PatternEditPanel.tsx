'use client'

import { Undo2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { BeadPattern } from '@/lib/beadPattern'
import {
  hasPatternEdits,
  mergeSimilarColorOverrides,
} from '@/lib/patternEdits'
type PatternEditPanelProps = {
  basePattern: BeadPattern
  colorOverrides: Record<string, string>
  onPushOverrides: (overrides: Record<string, string>) => void
  onUndo: () => void
  onReset: () => void
  canUndo: boolean
}

export function PatternEditPanel({
  basePattern,
  colorOverrides,
  onPushOverrides,
  onUndo,
  onReset,
  canUndo,
}: PatternEditPanelProps) {
  const t = useTranslations('pattern')
  const [mergeThreshold, setMergeThreshold] = useState(10)

  const edited = hasPatternEdits(colorOverrides)

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/10 bg-white/60 p-3">
      <div>
        <h3 className="font-medium">{t('mergeSimilar')}</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">{t('mergeSimilarHint')}</p>
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
      </label>

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
