'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { BeadPattern } from '@/lib/beadPattern'
import { hasPatternEdits, mergeSimilarColorOverrides } from '@/lib/patternEdits'
import { cn } from '@/lib/utils'

type MergeSimilarPopoverProps = {
  open: boolean
  basePattern: BeadPattern
  colorOverrides: Record<string, string>
  onPushOverrides: (overrides: Record<string, string>) => void
  onReset: () => void
  onClose: () => void
}

export function MergeSimilarPopover({
  open,
  basePattern,
  colorOverrides,
  onPushOverrides,
  onReset,
  onClose,
}: MergeSimilarPopoverProps) {
  const t = useTranslations('pattern')
  const [mergeThreshold, setMergeThreshold] = useState(10)
  const edited = hasPatternEdits(colorOverrides)

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-label={t('mergeSimilar')}
      className="absolute right-0 top-full z-30 mt-1.5 w-72 rounded-xl border border-black/10 bg-white p-3 shadow-lg"
    >
      <p className="text-xs leading-snug text-[var(--muted)]" title={t('mergeSimilarHint')}>
        <span className="font-medium text-[var(--foreground)]">{t('mergeSimilar')}</span>
        <span className="text-[var(--muted)]"> · {t('mergeSimilarHintShort')}</span>
      </p>

      <label className="mt-3 flex flex-col gap-1.5 text-xs">
        <span className="font-medium text-[var(--muted)]">{t('mergeThreshold')}</span>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={2}
            max={25}
            value={mergeThreshold}
            onChange={(e) => setMergeThreshold(Number(e.target.value))}
            className="min-w-0 flex-1 accent-[var(--accent)]"
          />
          <span className="w-9 shrink-0 font-mono text-[10px] tabular-nums text-[var(--muted)]">
            ΔE {mergeThreshold}
          </span>
        </div>
      </label>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            onPushOverrides(
              mergeSimilarColorOverrides(basePattern, colorOverrides, mergeThreshold),
            )
            onClose()
          }}
          className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
        >
          {t('mergeSimilarAction')}
        </button>
        {edited && (
          <button
            type="button"
            onClick={() => {
              onReset()
              onClose()
            }}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            {t('resetEdits')}
          </button>
        )}
      </div>
    </div>
  )
}

type MergeSimilarToolbarButtonProps = {
  open: boolean
  onToggle: () => void
  className?: string
}

export function MergeSimilarToolbarButton({
  open,
  onToggle,
  className,
}: MergeSimilarToolbarButtonProps) {
  const t = useTranslations('pattern')

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-haspopup="dialog"
      className={cn(
        'rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors',
        open
          ? 'border-[#34205f] bg-[#34205f]/10 text-[#34205f]'
          : 'border-black/15 bg-white text-[var(--foreground)] hover:bg-black/[0.04]',
        className,
      )}
    >
      {t('mergeSimilar')}
    </button>
  )
}
