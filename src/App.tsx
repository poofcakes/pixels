import { AboutPage } from '@/components/AboutPage'
import { ColorChartPage } from '@/components/ColorChartPage'
import { ColorDetailPage } from '@/components/ColorDetailPage'
import { ColorMatcherPage } from '@/components/ColorMatcherPage'
import { MardArtkalComparisonPage } from '@/components/MardArtkalComparisonPage'
import { PatternMakerPage } from '@/components/PatternMakerPage'
import { SiteFooter, SiteHeader } from '@/components/SiteHeader'
import { BEAD_PALETTE_IDS, type BeadPaletteId } from '@/lib/beadPalettes'
import { NextIntlClientProvider } from './next-intl-shim'
import messages from '../messages/en.json'

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const isColorsRoute = pathname === '/colors' || pathname.startsWith('/colors/')
  const isColorMatcherRoute = pathname === '/color-matcher'
  const isMardArtkalComparisonRoute = pathname === '/mard-artkal-comparison'
  const isAboutRoute = pathname === '/about'
  const colorSegments = pathname.startsWith('/colors/')
    ? pathname.replace('/colors/', '').split('/').filter(Boolean)
    : []
  const colorSlug = colorSegments[0] ?? null
  const colorCode = colorSegments[1] ?? null
  const paletteId =
    colorSlug && BEAD_PALETTE_IDS.includes(colorSlug as BeadPaletteId)
      ? (colorSlug as BeadPaletteId)
      : null

  return (
    <NextIntlClientProvider messages={messages}>
      <div className="flex min-h-screen flex-col">
        <SiteHeader pathname={pathname} />
        <div className="flex-1">
          {isColorsRoute && colorCode ? (
            <ColorDetailPage paletteId={paletteId} colorCode={colorCode} />
          ) : isColorsRoute ? (
            <ColorChartPage paletteId={paletteId} />
          ) : isColorMatcherRoute ? (
            <ColorMatcherPage />
          ) : isMardArtkalComparisonRoute ? (
            <MardArtkalComparisonPage />
          ) : isAboutRoute ? (
            <AboutPage />
          ) : (
            <PatternMakerPage exampleAssetBasePath="pixels/examples/omok" />
          )}
        </div>
        <SiteFooter pathname={pathname} />
      </div>
    </NextIntlClientProvider>
  )
}
