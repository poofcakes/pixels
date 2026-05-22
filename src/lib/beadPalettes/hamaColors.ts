/**
 * Hama Midi bead colours (2024 chart on pixel-beads.com).
 * @see https://www.pixel-beads.com/hama-bead-color-chart
 */
import type { BeadColor } from './types'

const entries: readonly (readonly [string, string])[] = [
  ['H01', '#ECEDED'],
  ['H02', '#F0E8B9'],
  ['H03', '#F0B901'],
  ['H04', '#E64F27'],
  ['H05', '#B63136'],
  ['H06', '#E1889F'],
  ['H07', '#694A82'],
  ['H08', '#2C4690'],
  ['H09', '#305CB0'],
  ['H10', '#256847'],
  ['H101', '#A9C39B'],
  ['H102', '#356B2D'],
  ['H103', '#FFE660'],
  ['H104', '#BCD122'],
  ['H105', '#FFAC78'],
  ['H106', '#CCC5ED'],
  ['H107', '#6A87C1'],
  ['H11', '#49AE89'],
  ['H12', '#534137'],
  ['H17', '#83888A'],
  ['H18', '#2E2F31'],
  ['H20', '#7F332A'],
  ['H21', '#A5693F'],
  ['H22', '#A52D36'],
  ['H26', '#DE9B90'],
  ['H27', '#DEB48B'],
  ['H28', '#363F38'],
  ['H29', '#B9395E'],
  ['H30', '#592F38'],
  ['H31', '#6797AE'],
  ['H33', '#FF3956'],
  ['H43', '#F0EA37'],
  ['H44', '#EE6972'],
  ['H45', '#886DB9'],
  ['H46', '#629ED7'],
  ['H47', '#83CB70'],
  ['H48', '#CF70B7'],
  ['H49', '#4998BC'],
  ['H60', '#F49422'],
  ['H70', '#B6B6D4'],
  ['H71', '#464541'],
  ['H75', '#BF7B4D'],
  ['H76', '#663317'],
  ['H77', '#EDE7DF'],
  ['H78', '#FFC99A'],
  ['H79', '#F08643'],
  ['H82', '#962F5C'],
  ['H83', '#0178A4'],
  ['H84', '#8B924C'],
  ['H95', '#F8CCE0'],
  ['H96', '#D4B1E3'],
  ['H97', '#A2D3FE'],
  ['H98', '#9ADBB1'],
] as const

export const HAMA_COLORS: readonly BeadColor[] = entries.map(([code, hex]) => ({
  code,
  hex: hex.toUpperCase(),
  name: code,
}))

export const HAMA_COLOR_COUNT = HAMA_COLORS.length
