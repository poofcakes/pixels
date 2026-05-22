'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { isLightHex } from '@/lib/mardColors'
import { cn } from '@/lib/utils'

type ColorChipProps = {
  code: string
  hex: string
  copyLabel: string
  copiedLabel: string
}

export function ColorChip({ code, hex, copyLabel, copiedLabel }: ColorChipProps) {
  const [copied, setCopied] = useState(false)
  const light = isLightHex(hex)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(hex)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1400)
    } catch {
      // Clipboard may be unavailable in insecure contexts.
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={`${copied ? copiedLabel : copyLabel} ${code} ${hex}`}
      className={cn(
        'group relative flex aspect-square w-full flex-col items-start justify-between rounded-lg border p-2 text-left font-mono text-[10px] leading-tight transition-transform hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2',
        light ? 'border-black/10 text-black/80' : 'border-white/15 text-white/90',
      )}
      style={{ backgroundColor: hex }}
    >
      <span className="font-semibold">{code}</span>
      <span className="flex w-full items-end justify-between">
        <span className="opacity-80">{hex}</span>
        <span
          aria-hidden
          className={cn(
            'rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
            light ? 'bg-black/10' : 'bg-white/15',
          )}
        >
          {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
        </span>
      </span>
    </button>
  )
}
