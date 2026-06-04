import { MARD_COLORS } from '@/lib/mardColors'

import { ARTKAL_C_COLORS, ARTKAL_C_COLOR_COUNT } from './artkalCColors'
import { ARTKAL_M_COLORS, ARTKAL_M_COLOR_COUNT } from './artkalMColors'
import { ARTKAL_COLORS, ARTKAL_COLOR_COUNT } from './artkalColors'
import { HAMA_COLORS, HAMA_COLOR_COUNT } from './hamaColors'
import { NABBI_COLORS, NABBI_COLOR_COUNT } from './nabbiColors'
import { PERLER_COLORS, PERLER_COLOR_COUNT } from './perlerColors'
import { PYSSLA_COLORS, PYSSLA_COLOR_COUNT } from './pysslaColors'
import type { BeadColor, BeadPalette, BeadPaletteId } from './types'
import { ZLLBTMO_COLORS, ZLLBTMO_COLOR_COUNT } from './zllbtmoColors'

export type { BeadColor, BeadPalette, BeadPaletteId } from './types'

const mardPaletteColors: readonly BeadColor[] = MARD_COLORS.map((c) => ({
  code: c.code,
  hex: c.hex,
}))

const SINGLE_BRAND_PALETTES: readonly BeadPalette[] = [
  {
    id: 'mard',
    label: 'MARD',
    sourceUrl: 'https://www.pixel-beads.com/mard-bead-color-chart',
    colors: mardPaletteColors,
  },
  {
    id: 'perler',
    label: 'Perler',
    sourceUrl: 'https://www.pixel-beads.com/perler-bead-color-chart',
    colors: PERLER_COLORS,
  },
  {
    id: 'hama',
    label: 'Hama Midi',
    sourceUrl: 'https://www.pixel-beads.com/hama-bead-color-chart',
    colors: HAMA_COLORS,
  },
  {
    id: 'artkal',
    label: 'Artkal-S',
    sourceUrl: 'https://www.pixel-beads.com/artkal-bead-color-chart',
    colors: ARTKAL_COLORS,
  },
  {
    id: 'artkalC',
    label: 'Artkal Mini · C chart',
    sourceUrl:
      'https://cdn.shopify.com/s/files/1/1323/8195/files/C_MINI_Beads_RGB_Color_Chart_2024.pdf?v=1744700289',
    colors: ARTKAL_C_COLORS,
  },
  {
    id: 'artkalM',
    label: 'Artkal Mini · M chart',
    sourceUrl:
      'https://cdn.shopify.com/s/files/1/1323/8195/files/M_MINI_Beads_RGB_Color_Chart_2025.pdf?v=1760661747',
    colors: ARTKAL_M_COLORS,
  },
  {
    id: 'nabbi',
    label: 'Nabbi',
    sourceUrl: 'https://www.pixel-beads.com/nabbi-bead-color-chart',
    colors: NABBI_COLORS,
  },
  {
    id: 'pyssla',
    label: 'IKEA Pyssla',
    sourceUrl: 'https://www.pixel-beads.com/ikea-pyssla-bead-color-chart',
    colors: PYSSLA_COLORS,
  },
  {
    id: 'zllbtmo',
    label: 'ZLLBTMO',
    sourceUrl: '/pixels/references/zllbtmo-reference.webp',
    colors: ZLLBTMO_COLORS,
  },
] as const

const mixedPaletteColors: readonly BeadColor[] = SINGLE_BRAND_PALETTES.flatMap((palette) =>
  palette.colors.map((color) => ({
    ...color,
    code: `${palette.label} ${color.code}`,
    brandId: palette.id,
    brandLabel: palette.label,
  })),
)

export const BEAD_PALETTES: readonly BeadPalette[] = [
  ...SINGLE_BRAND_PALETTES,
  {
    id: 'mixed',
    label: 'Mixed brands',
    sourceUrl: '',
    colors: mixedPaletteColors,
  },
] as const

export const BEAD_PALETTE_IDS: readonly BeadPaletteId[] = BEAD_PALETTES.map((p) => p.id)

const PALETTE_BY_ID = new Map<BeadPaletteId, BeadPalette>(
  BEAD_PALETTES.map((p) => [p.id, p] as const),
)

const COLOR_BY_PALETTE_AND_CODE = new Map<string, BeadColor>()
for (const palette of BEAD_PALETTES) {
  for (const color of palette.colors) {
    COLOR_BY_PALETTE_AND_CODE.set(`${palette.id}:${color.code}`, color)
  }
}

export function getBeadPalette(id: BeadPaletteId): BeadPalette {
  const palette = PALETTE_BY_ID.get(id)
  if (!palette) throw new Error(`Unknown palette: ${id}`)
  return palette
}

export function getBeadColor(paletteId: BeadPaletteId, code: string): BeadColor | undefined {
  return COLOR_BY_PALETTE_AND_CODE.get(`${paletteId}:${code}`)
}

export function getPaletteColorCount(id: BeadPaletteId): number {
  switch (id) {
    case 'mard':
      return mardPaletteColors.length
    case 'perler':
      return PERLER_COLOR_COUNT
    case 'hama':
      return HAMA_COLOR_COUNT
    case 'artkal':
      return ARTKAL_COLOR_COUNT
    case 'artkalC':
      return ARTKAL_C_COLOR_COUNT
    case 'artkalM':
      return ARTKAL_M_COLOR_COUNT
    case 'nabbi':
      return NABBI_COLOR_COUNT
    case 'pyssla':
      return PYSSLA_COLOR_COUNT
    case 'zllbtmo':
      return ZLLBTMO_COLOR_COUNT
    case 'mixed':
      return mixedPaletteColors.length
  }
}
