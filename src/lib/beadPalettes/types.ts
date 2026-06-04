/** A single fuse-bead colour in a brand palette. */
export type BeadColor = {
  code: string
  hex: string
  name?: string
  brandId?: BeadPaletteId
  brandLabel?: string
}

export type BeadPaletteId =
  | 'mard'
  | 'perler'
  | 'hama'
  | 'pyssla'
  | 'nabbi'
  | 'artkal'
  | 'artkalC'
  | 'artkalM'
  | 'zllbtmo'
  | 'mixed'

export type BeadPalette = {
  id: BeadPaletteId
  label: string
  sourceUrl: string
  colors: readonly BeadColor[]
}
