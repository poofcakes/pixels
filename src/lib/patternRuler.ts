/** How often to print a label on the preview rulers (1 = every cell). */
export function rulerLabelStep(length: number): number {
  if (length <= 24) return 1
  if (length <= 60) return 5
  if (length <= 120) return 10
  return 20
}

export function shouldShowRulerLabel(index: number, length: number, step: number): boolean {
  if (step <= 1) return true
  if (index === 0 || index === length - 1) return true
  if (length - (index + 1) < Math.ceil(step / 2)) return false
  return (index + 1) % step === 0
}

export function rulerBandSize(cellPx: number): number {
  return Math.max(16, Math.min(22, Math.floor(cellPx * 0.6) + 8))
}

export function rulerFontSize(cellPx: number): number {
  return Math.max(8, Math.min(11, Math.floor(cellPx * 0.42)))
}
