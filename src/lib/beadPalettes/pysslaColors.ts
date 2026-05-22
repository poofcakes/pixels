/**
 * IKEA Pyssla bead colours (2026 revised chart on pixel-beads.com).
 * @see https://www.pixel-beads.com/ikea-pyssla-bead-color-chart
 */
import type { BeadColor } from './types'

const entries: readonly (readonly [string, string, string])[] = [
  ['Black', '#000000', 'Black'],
  ['Blue', '#0657D8', 'Blue'],
  ['Blue (Pastell)', '#93D3E2', 'Blue (Pastell)'],
  ['Brown', '#3A0909', 'Brown'],
  ['Green', '#1FAA03', 'Green'],
  ['Green (Pastell)', '#ACBF33', 'Green (Pastell)'],
  ['Grey (Pastell)', '#9E9C9D', 'Grey (Pastell)'],
  ['Orange', '#F2741A', 'Orange'],
  ['Orange (Pastell)', '#EDA250', 'Orange (Pastell)'],
  ['Pink', '#FF66B7', 'Pink'],
  ['Pink (Pastell)', '#F2BFD2', 'Pink (Pastell)'],
  ['Purple', '#BE88EA', 'Purple'],
  ['Purple (Pastell)', '#C5B7DA', 'Purple (Pastell)'],
  ['Red', '#D80606', 'Red'],
  ['Sand (Pastell)', '#E0BEA8', 'Sand (Pastell)'],
  ['White', '#FFFFFF', 'White'],
  ['Yellow', '#FFE016', 'Yellow'],
  ['Yellow (Pastell)', '#F7EE45', 'Yellow (Pastell)'],
] as const

export const PYSSLA_COLORS: readonly BeadColor[] = entries.map(([code, hex, name]) => ({
  code,
  hex: hex.toUpperCase(),
  name,
}))

export const PYSSLA_COLOR_COUNT = PYSSLA_COLORS.length
