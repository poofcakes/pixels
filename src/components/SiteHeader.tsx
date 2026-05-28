'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faFacebookF,
  faInstagram,
  faTiktok,
  faXTwitter,
  faYoutube,
} from '@fortawesome/free-brands-svg-icons'
import { useTranslations } from 'next-intl'

type SiteHeaderProps = {
  pathname: string
}

const primaryLinks = [
  { href: '/', key: 'home' },
  { href: '/colors/', key: 'colors' },
  { href: '/about', key: 'about' },
] as const

const socialLinks = [
  { href: 'https://www.instagram.com/poofpixels', label: 'Instagram', icon: faInstagram },
  { href: 'https://x.com/poofpixels', label: 'X', icon: faXTwitter },
  { href: 'https://www.tiktok.com/@poofpixels', label: 'TikTok', icon: faTiktok },
  { href: 'https://www.facebook.com/poofpixels', label: 'Facebook', icon: faFacebookF },
  { href: 'https://www.youtube.com/@poofpixels', label: 'YouTube', icon: faYoutube },
] as const

function navClass(active: boolean): string {
  return [
    'rounded-full px-3 py-1.5 text-sm font-semibold transition-colors',
    active
      ? 'bg-[var(--accent)] text-white shadow-sm'
      : 'text-[var(--muted)] hover:bg-[var(--accent)]/10 hover:text-[var(--accent)]',
  ].join(' ')
}

function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/'
  const normalized = href.replace(/\/+$/, '')
  return pathname === normalized || pathname.startsWith(`${normalized}/`)
}

export function SiteHeader({ pathname }: SiteHeaderProps) {
  const t = useTranslations('siteNav')

  return (
    <header className="sticky top-0 z-30 border-b border-black/10 bg-[#fff8fd]/95 shadow-sm backdrop-blur">
      <div className="mx-auto flex max-w-[min(1500px,100vw)] flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <a
          href="/"
          className="flex w-fit items-center gap-3 rounded-2xl pr-3 transition-colors hover:bg-white/70"
          aria-label={t('homeAria')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/poofpixels-logo.webp" alt="Poofpixels" className="h-11 w-auto" />
          <span className="hidden text-sm font-semibold uppercase tracking-[0.18em] text-[#34205f] sm:inline">
            Poofpixels
          </span>
        </a>

        <div className="flex flex-wrap items-center gap-3 md:justify-end">
          <nav
            aria-label={t('primaryAria')}
            className="flex flex-wrap items-center gap-1 rounded-full border border-black/10 bg-white/70 p-1 shadow-sm"
          >
            {primaryLinks.map((link) => (
              <a key={link.href} href={link.href} className={navClass(isActivePath(pathname, link.href))}>
                {t(link.key)}
              </a>
            ))}
          </nav>

          <div className="hidden h-6 w-px bg-black/10 md:block" />

          <nav aria-label={t('socialAria')} className="flex items-center gap-2">
            {socialLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                title={link.label}
                className="inline-flex size-9 items-center justify-center rounded-full border border-[var(--accent)]/20 bg-white/70 text-[var(--accent)] transition-colors hover:border-[var(--accent)]/40 hover:bg-[var(--accent)]/10"
              >
                <FontAwesomeIcon icon={link.icon} className="size-4" aria-hidden="true" />
              </a>
            ))}
          </nav>
        </div>
      </div>
    </header>
  )
}

export function SiteFooter({ pathname }: SiteHeaderProps) {
  const t = useTranslations('siteNav')

  return (
    <footer className="border-t border-black/10 bg-[#fff8fd]/70 text-sm text-[var(--muted)]">
      <div className="mx-auto flex max-w-[min(1500px,100vw)] flex-col gap-3 px-4 py-5 sm:flex-row sm:items-center sm:justify-between">
        <a
          href="/"
          className="flex w-fit items-center gap-2 font-semibold uppercase tracking-[0.16em] text-[#34205f] transition-colors hover:text-[var(--accent)]"
          aria-label={t('homeAria')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/poofpixels-logo.webp" alt="Poofpixels" className="h-7 w-auto" />
          <span>Poofpixels</span>
        </a>

        <div className="flex flex-wrap items-center gap-x-5 gap-y-3 sm:justify-end">
          <nav aria-label={t('primaryAria')} className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {primaryLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={[
                  'transition-colors hover:text-[var(--accent)]',
                  isActivePath(pathname, link.href)
                    ? 'font-semibold text-[#34205f]'
                    : 'text-[var(--muted)]',
                ].join(' ')}
              >
                {t(link.key)}
              </a>
            ))}
          </nav>

          <nav aria-label={t('socialAria')} className="flex items-center gap-1.5">
            {socialLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={link.label}
                title={link.label}
                className="inline-flex size-7 items-center justify-center rounded-full text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10"
              >
                <FontAwesomeIcon icon={link.icon} className="size-3.5" aria-hidden="true" />
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  )
}
