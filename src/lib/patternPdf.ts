function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(length)
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

/** ISO A4 in PDF points (72 DPI). */
const A4_WIDTH_PT = 595
const A4_HEIGHT_PT = 842

export function canvasToPdfBlob(canvas: HTMLCanvasElement): Blob {
  const encoder = new TextEncoder()
  const jpegDataUrl = canvas.toDataURL('image/jpeg', 1)
  const jpegBytes = base64ToBytes(jpegDataUrl.split(',')[1] ?? '')
  const pageWidth = A4_WIDTH_PT
  const pageHeight = Math.max(
    A4_HEIGHT_PT,
    Math.round((canvas.height / canvas.width) * A4_WIDTH_PT),
  )
  const drawHeight = Math.round((canvas.height / canvas.width) * pageWidth)
  const drawY = 0

  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${canvas.width} /Height ${canvas.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    `\nendstream\nendobj\n`,
    `5 0 obj\n<< /Length ${`q\n${pageWidth} 0 0 ${drawHeight} 0 ${drawY} cm\n/Im0 Do\nQ\n`.length} >>\nstream\nq\n${pageWidth} 0 0 ${drawHeight} 0 ${drawY} cm\n/Im0 Do\nQ\nendstream\nendobj\n`,
  ]

  const chunks: Uint8Array[] = [encoder.encode('%PDF-1.4\n')]
  const offsets = [0]
  let byteOffset = chunks[0].length

  for (let i = 0; i < objects.length; i++) {
    offsets.push(byteOffset)
    if (i === 3) {
      const before = encoder.encode(objects[i])
      const after = encoder.encode(objects[i + 1])
      chunks.push(before, jpegBytes, after)
      byteOffset += before.length + jpegBytes.length + after.length
      i++
    } else {
      const bytes = encoder.encode(objects[i])
      chunks.push(bytes)
      byteOffset += bytes.length
    }
  }

  const xrefOffset = byteOffset
  const xref = [
    'xref\n0 6\n',
    '0000000000 65535 f \n',
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`),
    `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`,
  ].join('')
  chunks.push(encoder.encode(xref))

  const pdfBytes = concatBytes(chunks)
  const blobBytes = new Uint8Array(pdfBytes.length)
  blobBytes.set(pdfBytes)
  return new Blob([blobBytes], { type: 'application/pdf' })
}
