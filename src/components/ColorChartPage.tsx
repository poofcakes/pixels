'use client'

import { useTranslations } from 'next-intl'

import { ColorChip } from '@/components/ColorChip'
import { MARD_COLOR_COUNT, MARD_COLOR_SERIES } from '@/lib/mardColors'

export function ColorChartPage() {
  const t = useTranslations('colors')
  const tSeries = useTranslations('colors.series')

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <header className="flex flex-col gap-3">
        <a href="/" className="text-sm font-medium text-[var(--accent)] hover:underline">
          Back to pattern maker
        </a>
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--accent)]">
          {t('countLabel', { count: MARD_COLOR_COUNT })}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{t('title')}</h1>
        <p className="max-w-2xl text-[var(--muted)]">
          {t('subtitle', { count: MARD_COLOR_COUNT })}
        </p>
      </header>

      <div className="mt-12 flex flex-col gap-14">
        {MARD_COLOR_SERIES.map((series) => {
          let label: string
          try {
            label = tSeries(series.id as never)
          } catch {
            label = series.label
          }

          return (
            <section key={series.id} aria-labelledby={`series-${series.id}`}>
              <div className="flex items-baseline justify-between gap-4 border-b border-black/10 pb-2">
                <h2 id={`series-${series.id}`} className="text-xl font-semibold tracking-tight">
                  <span className="font-mono text-[var(--muted)]">{series.id}</span> · {label}
                </h2>
                <span className="font-mono text-xs text-[var(--muted)]">
                  {t('countLabel', { count: series.colors.length })}
                </span>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9 xl:grid-cols-11">
                {series.colors.map((c) => (
                  <ColorChip
                    key={c.code}
                    code={c.code}
                    hex={c.hex}
                    copyLabel={t('copy')}
                    copiedLabel={t('copied')}
                  />
                ))}
              </div>
            </section>
          )
        })}
      </div>

      <footer className="mt-16 border-t border-black/10 pt-6 text-xs text-[var(--muted)]">
        <p>{t('disclaimer')}</p>
        <p className="mt-1">{t('source')}</p>
      </footer>
    </main>
  )
}
