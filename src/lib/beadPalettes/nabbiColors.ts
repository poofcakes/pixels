/**
 * Nabbi bead colours (2026 revised chart on pixel-beads.com).
 * @see https://www.pixel-beads.com/nabbi-bead-color-chart
 */
import type { BeadColor } from './types'

const entries: readonly (readonly [string, string])[] = [
  ['N01', '#3A3D41'],
  ['N02', '#50443B'],
  ['N03', '#5A3E36'],
  ['N04', '#813547'],
  ['N05', '#A76224'],
  ['N06', '#AD967E'],
  ['N07', '#EEB182'],
  ['N08', '#8D8B7F'],
  ['N09', '#2F4A39'],
  ['N10', '#D3CBCB'],
  ['N11', '#644591'],
  ['N12', '#E2D0BF'],
  ['N13', '#F3601B'],
  ['N14', '#F9CA00'],
  ['N15', '#F4F4F3'],
  ['N16', '#297A3B'],
  ['N17', '#3B75CB'],
  ['N18', '#E1B4AB'],
  ['N19', '#DF2638'],
  ['N20', '#B58B69'],
  ['N21', '#F5EC8D'],
  ['N22', '#48AF4F'],
  ['N23', '#71A3E6'],
  ['N24', '#B6A0DB'],
  ['N25', '#EE6A97'],
  ['N26', '#FCA879'],
  ['N27', '#875F52'],
  ['N28', '#A7C6F1'],
  ['N29', '#EE9527'],
  ['N30', '#C7BF5E'],
] as const

export const NABBI_COLORS: readonly BeadColor[] = entries.map(([code, hex]) => ({
  code,
  hex: hex.toUpperCase(),
}))

export const NABBI_COLOR_COUNT = NABBI_COLORS.length
