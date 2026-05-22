import type { BeadColor, BeadPalette, BeadPaletteId } from '@/lib/beadPalettes'
import { getBeadPalette } from '@/lib/beadPalettes'

export type BeadMatchMethod = 'lab76' | 'lab2000' | 'rgb' | 'weightedRgb'

export const BEAD_MATCH_METHODS: readonly BeadMatchMethod[] = [
  'lab76',
  'lab2000',
  'rgb',
  'weightedRgb',
]

type Lab = readonly [number, number, number]
type Rgb = readonly [number, number, number]

type IndexedBeadColor = BeadColor & { lab: Lab; rgb: Rgb }

function srgbChannelToLinear(channel: number): number {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const rl = srgbChannelToLinear(r)
  const gl = srgbChannelToLinear(g)
  const bl = srgbChannelToLinear(b)
  return [
    rl * 0.4124564 + gl * 0.3575761 + bl * 0.1804375,
    rl * 0.2126729 + gl * 0.7151522 + bl * 0.072175,
    rl * 0.0193339 + gl * 0.119192 + bl * 0.9503041,
  ]
}

function xyzToLab(x: number, y: number, z: number): Lab {
  const refX = 0.95047
  const refY = 1
  const refZ = 1.08883

  const f = (t: number) =>
    t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116

  const fx = f(x / refX)
  const fy = f(y / refY)
  const fz = f(z / refZ)

  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

export function hexToRgb(hex: string): Rgb {
  const v = hex.replace('#', '')
  if (v.length !== 6) return [0, 0, 0]
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ]
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const [x, y, z] = rgbToXyz(r, g, b)
  return xyzToLab(x, y, z)
}

export function deltaE76(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const [L1, a1, b1] = lab1
  const [L2, a2, b2] = lab2

  const avgLp = (L1 + L2) / 2
  const C1 = Math.hypot(a1, b1)
  const C2 = Math.hypot(a2, b2)
  const avgC = (C1 + C2) / 2

  const G =
    0.5 *
    (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)))

  const a1p = (1 + G) * a1
  const a2p = (1 + G) * a2
  const C1p = Math.hypot(a1p, b1)
  const C2p = Math.hypot(a2p, b2)
  const avgCp = (C1p + C2p) / 2

  const h1p = (Math.atan2(b1, a1p) * 180) / Math.PI + (Math.atan2(b1, a1p) < 0 ? 360 : 0)
  const h2p = (Math.atan2(b2, a2p) * 180) / Math.PI + (Math.atan2(b2, a2p) < 0 ? 360 : 0)

  let dhp = h2p - h1p
  if (dhp > 180) dhp -= 360
  if (dhp < -180) dhp += 360

  const dLp = L2 - L1
  const dCp = C2p - C1p
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(((dhp / 2) * Math.PI) / 180)

  const avgHp =
    Math.abs(h1p - h2p) > 180
      ? (h1p + h2p + 360) / 2
      : (h1p + h2p) / 2

  const T =
    1 -
    0.17 * Math.cos(((avgHp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * avgHp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * avgHp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * avgHp - 63) * Math.PI) / 180)

  const dRo = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2))
  const RC = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7))
  const SL = 1 + (0.015 * (avgLp - 50) ** 2) / Math.sqrt(20 + (avgLp - 50) ** 2)
  const SC = 1 + 0.045 * avgCp
  const SH = 1 + 0.015 * avgCp * T
  const RT = -RC * Math.sin((2 * dRo * Math.PI) / 180)

  return Math.sqrt(
    (dLp / SL) ** 2 +
      (dCp / SC) ** 2 +
      (dHp / SH) ** 2 +
      RT * (dCp / SC) * (dHp / SH),
  )
}

function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
}

function weightedRgbDistance(a: Rgb, b: Rgb): number {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db)
}

function indexPalette(
  palette: BeadPalette,
  allowedCodes?: ReadonlySet<string> | null,
): IndexedBeadColor[] {
  const colors =
    allowedCodes && allowedCodes.size > 0
      ? palette.colors.filter((c) => allowedCodes.has(c.code))
      : palette.colors

  return colors.map((color) => {
    const rgb = hexToRgb(color.hex)
    return { ...color, rgb, lab: rgbToLab(...rgb) }
  })
}

export type BeadMatcher = {
  paletteId: BeadPaletteId
  method: BeadMatchMethod
  match: (r: number, g: number, b: number) => BeadColor
}

function distanceForMethod(
  method: BeadMatchMethod,
  r: number,
  g: number,
  b: number,
  entry: IndexedBeadColor,
  lab: Lab,
): number {
  switch (method) {
    case 'lab76':
      return deltaE76(lab, entry.lab)
    case 'lab2000':
      return deltaE2000(lab, entry.lab)
    case 'rgb':
      return rgbDistance([r, g, b], entry.rgb)
    case 'weightedRgb':
      return weightedRgbDistance([r, g, b], entry.rgb)
    default:
      return deltaE76(lab, entry.lab)
  }
}

export function createBeadMatcher(
  paletteId: BeadPaletteId,
  method: BeadMatchMethod = 'lab76',
  allowedCodes?: ReadonlySet<string> | null,
): BeadMatcher {
  const palette = getBeadPalette(paletteId)
  const indexed = indexPalette(palette, allowedCodes)

  if (indexed.length === 0) {
    throw new Error('No bead colours available for matching (check your stock selection).')
  }

  function match(r: number, g: number, b: number): BeadColor {
    const lab = rgbToLab(r, g, b)
    let best = indexed[0]
    let bestDist = Infinity

    for (const entry of indexed) {
      const dist = distanceForMethod(method, r, g, b, entry, lab)
      if (dist < bestDist) {
        bestDist = dist
        best = entry
      }
    }

    return best
  }

  return { paletteId, method, match }
}
