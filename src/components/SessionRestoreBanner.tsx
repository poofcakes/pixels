'use client'

import { useTranslations } from 'next-intl'

type SessionRestoreBannerProps = {
  onRestore: () => void
  onDismiss: () => void
}

export function SessionRestoreBanner({ onRestore, onDismiss }: SessionRestoreBannerProps) {
  const t = useTranslations('pattern')

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-4 py-3 text-sm shadow-sm"
    >
      <p className="text-[var(--foreground)]">{t('restoreSessionPrompt')}</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-md border border-black/15 bg-white px-3 py-1.5 text-sm hover:bg-black/[0.03]"
        >
          {t('restoreDismiss')}
        </button>
        <button
          type="button"
          onClick={onRestore}
          className="rounded-md bg-[#34205f] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
        >
          {t('restoreConfirm')}
        </button>
      </div>
    </div>
  )
}
