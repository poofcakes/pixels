'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'

import { BeadPatternGenerator } from '@/components/BeadPatternGenerator'

type PatternMakerPageProps = {
  colorsLink: ReactNode
  exampleAssetBasePath?: string
}

export function PatternMakerPage({
  colorsLink,
  exampleAssetBasePath,
}: PatternMakerPageProps) {
  const t = useTranslations('pattern')

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:py-12">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--accent)]">
          {t('eyebrow')}
        </p>
        <h1 className="text-4xl font-semibold tracking-tight md:text-5xl">{t('title')}</h1>
        <p className="max-w-2xl text-[var(--muted)]">{t('subtitle')}</p>
        <p className="text-sm text-[var(--muted)]">
          {t('chartLink')} {colorsLink}
        </p>
      </header>

      <div className="mt-10">
        <BeadPatternGenerator exampleAssetBasePath={exampleAssetBasePath} />
      </div>

      <footer className="mt-16 border-t border-black/10 pt-6 text-xs text-[var(--muted)]">
        <p>{t('disclaimer')}</p>
      </footer>
    </main>
  )
}
