import messages from '../messages/en.json'
import { ColorChartPage } from '@/components/ColorChartPage'
import { PatternMakerPage } from '@/components/PatternMakerPage'
import { NextIntlClientProvider } from './next-intl-shim'

const pattern = messages.pattern

export default function App() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
  const isColorsPage = pathname === '/colors'

  return (
    <NextIntlClientProvider messages={messages}>
      {isColorsPage ? (
        <ColorChartPage />
      ) : (
        <PatternMakerPage
          exampleAssetBasePath="pixels/examples/omok"
          colorsLink={
            <a href="/colors/" className="text-[var(--accent)] hover:underline">
              {pattern.chartLinkLabel}
            </a>
          }
        />
      )}
    </NextIntlClientProvider>
  )
}
