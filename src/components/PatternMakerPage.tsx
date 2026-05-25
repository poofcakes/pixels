'use client'

import { useTranslations } from 'next-intl'

import { BeadPatternGenerator } from '@/components/BeadPatternGenerator'

type PatternMakerPageProps = {
  exampleAssetBasePath?: string
}

export function PatternMakerPage({
  exampleAssetBasePath,
}: PatternMakerPageProps) {
  const t = useTranslations('pattern')

  return (
    <main className="mx-auto max-w-[min(1500px,100vw)] px-4 py-8 sm:py-10">
      <BeadPatternGenerator
        exampleAssetBasePath={exampleAssetBasePath}
      />

      <footer className="mt-16 border-t border-black/10 pt-6 text-xs text-[var(--muted)]">
        <p>{t('disclaimer')}</p>
      </footer>
    </main>
  )
}
