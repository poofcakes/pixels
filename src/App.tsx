import { AboutPage } from '@/components/AboutPage'
import { ColorChartPage } from '@/components/ColorChartPage'
import { PatternMakerPage } from '@/components/PatternMakerPage'
import { SiteHeader } from '@/components/SiteHeader'
import { BEAD_PALETTE_IDS, type BeadPaletteId } from '@/lib/beadPalettes'
import { NextIntlClientProvider } from './next-intl-shim'
import messages from '../messages/en.json'

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const isColorsRoute = pathname === '/colors' || pathname.startsWith('/colors/')
  const isAboutRoute = pathname === '/about'
  const colorSlug = pathname.startsWith('/colors/')
    ? pathname.replace('/colors/', '').split('/')[0]
    : null
  const paletteId =
    colorSlug && BEAD_PALETTE_IDS.includes(colorSlug as BeadPaletteId)
      ? (colorSlug as BeadPaletteId)
      : null

  return (
    <NextIntlClientProvider messages={messages}>
      <SiteHeader pathname={pathname} />
      {isColorsRoute ? (
        <ColorChartPage paletteId={paletteId} />
      ) : isAboutRoute ? (
        <AboutPage />
      ) : (
        <PatternMakerPage exampleAssetBasePath="pixels/examples/omok" />
      )}
    </NextIntlClientProvider>
  )
}
