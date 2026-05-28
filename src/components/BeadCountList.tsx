'use client'

import { CheckCircle2, MousePointer2, Pencil } from 'lucide-react'
import { useTranslations } from 'next-intl'

import type { BeadPattern } from '@/lib/beadPattern'
import { cn } from '@/lib/utils'

export type BeadStatRow = {
  code: string
  name: string
  count: number
  hex: string
  percent: number
}

export type BeadStatSortMode = 'count' | 'name'

type BeadCountListProps = {
  pattern: BeadPattern
  rows: BeadStatRow[]
  sortMode: BeadStatSortMode
  selectedCode: string | null
  hoveredCode: string | null
  completedCodes: ReadonlySet<string>
  onSortModeChange: (mode: BeadStatSortMode) => void
  onSelectCode: (code: string | null) => void
  onReplaceCode: (code: string) => void
  onToggleComplete: (code: string) => void
}

export function BeadCountList({
  pattern,
  rows,
  sortMode,
  selectedCode,
  hoveredCode,
  completedCodes,
  onSortModeChange,
  onSelectCode,
  onReplaceCode,
  onToggleComplete,
}: BeadCountListProps) {
  const t = useTranslations('pattern')
  const maxCount = Math.max(1, ...rows.map((row) => row.count))

  return (
    <section className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#34205f]">
          {t('beadCountTitle', { count: pattern.uniqueColors })}
        </h2>
        <label className="flex items-center gap-1 text-xs text-[var(--muted)]">
          <span>{t('beadSortLabel')}</span>
          <select
            value={sortMode}
            onChange={(event) => onSortModeChange(event.target.value as BeadStatSortMode)}
            className="rounded-md border border-black/15 bg-white px-2 py-1 text-xs text-[var(--foreground)]"
          >
            <option value="count">{t('beadSortCount')}</option>
            <option value="name">{t('beadSortName')}</option>
          </select>
        </label>
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--muted)]">
          <span className="inline-flex items-center gap-1">
            <MousePointer2 className="size-3.5" />
            {t('beadCountHighlight')}
          </span>
          <span className="inline-flex items-center gap-1">
            <Pencil className="size-3.5" />
            {t('beadCountReplace')}
          </span>
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="size-3.5" />
            {t('beadCountComplete')}
          </span>
        </div>
      </div>
      <ul className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-1">
        {rows.map((row) => {
          const isSelected = selectedCode === row.code
          const isHovered = hoveredCode === row.code
          const isComplete = completedCodes.has(row.code)
          const barPct = Math.max(4, (row.count / maxCount) * 100)

          return (
            <li
              key={row.code}
              className={cn(
                'group relative flex items-center gap-2 rounded-lg border px-2 py-1.5 transition-colors',
                isSelected && 'border-black/50 bg-black/[0.06]',
                !isSelected && isHovered && 'border-black/30 bg-black/[0.03]',
                !isSelected && !isHovered && 'border-black/8 bg-white',
              )}
            >
              <button
                type="button"
                onClick={() => onSelectCode(isSelected ? null : row.code)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <span
                  className="size-7 shrink-0 rounded-md border border-black/10"
                  style={{ backgroundColor: row.hex }}
                />
                <span className="flex w-24 shrink-0 flex-col leading-tight">
                  <span className="font-mono text-sm font-bold tabular-nums">{row.code}</span>
                  {row.name !== row.code && (
                    <span className="truncate text-[11px] text-[var(--muted)]">{row.name}</span>
                  )}
                </span>
                <span className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full opacity-80"
                    style={{ width: `${barPct}%`, backgroundColor: row.hex }}
                  />
                </span>
                <span className="w-12 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--muted)]">
                  {row.count}
                </span>
                <span className="w-11 shrink-0 text-right font-mono text-xs tabular-nums text-[var(--muted)]">
                  {row.percent.toFixed(1)}%
                </span>
              </button>
              <button
                type="button"
                onClick={() => onReplaceCode(row.code)}
                className="flex size-8 shrink-0 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-black/[0.05]"
                aria-label={t('replaceColor', { code: row.code })}
              >
                <Pencil className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onToggleComplete(row.code)}
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-black/[0.05]',
                  isComplete ? 'text-[var(--accent)]' : 'text-[var(--muted)]',
                )}
                aria-label={
                  isComplete
                    ? t('markIncomplete', { code: row.code })
                    : t('markComplete', { code: row.code })
                }
              >
                <CheckCircle2 className="size-3.5" />
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
