'use client'

import { useTranslations } from 'next-intl'

export function AboutPage() {
  const t = useTranslations('pattern')

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:py-14">
      <section className="rounded-3xl border border-black/10 bg-white/80 p-6 shadow-sm sm:p-8">
        <p className="text-sm font-medium uppercase tracking-wide text-[var(--accent)]">
          {t('aboutEyebrow')}
        </p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
          {t('aboutTitle')}
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-8 text-[var(--muted)]">
          {t('aboutBody')}
        </p>
      </section>
    </main>
  )
}
