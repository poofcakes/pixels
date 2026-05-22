/** A single fuse-bead colour in a brand palette. */
export type BeadColor = {
  code: string
  hex: string
  name?: string
}

export type BeadPaletteId =
  | 'mard'
  | 'perler'
  | 'hama'
  | 'pyssla'
  | 'nabbi'
  | 'artkal'

export type BeadPalette = {
  id: BeadPaletteId
  label: string
  sourceUrl: string
  colors: readonly BeadColor[]
}
