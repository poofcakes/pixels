import messages from '../messages/en.json'
import { PatternMakerPage } from '@/components/PatternMakerPage'
import { NextIntlClientProvider } from './next-intl-shim'

const pattern = messages.pattern

export default function App() {
  return (
    <NextIntlClientProvider messages={messages}>
      <PatternMakerPage
        exampleAssetBasePath="pixels/examples/omok"
        colorsLink={
          <a
            href="https://www.poofcakes.com/colors"
            className="text-[var(--accent)] hover:underline"
          >
            {pattern.chartLinkLabel}
          </a>
        }
      />
    </NextIntlClientProvider>
  )
}
