export type SniffedImageFormat = 'png' | 'jpeg' | 'webp' | 'gif' | 'heic' | 'unknown'

export type PreparedUploadImage = {
  file: File
  width: number
  height: number
  sniffedFormat: SniffedImageFormat
  declaredType: string
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image decode failed'))
    img.src = src
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('file read failed'))
    reader.readAsDataURL(blob)
  })
}

export function sniffImageFormat(bytes: Uint8Array): SniffedImageFormat {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png'
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg'
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46
  ) {
    const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]).toLowerCase()
    if (brand === 'webp') return 'webp'
    if (brand === 'heic' || brand === 'heif' || brand === 'mif1' || brand === 'msf1') {
      return 'heic'
    }
  }
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'gif'
  }
  return 'unknown'
}

function mimeForFormat(format: SniffedImageFormat): string | null {
  switch (format) {
    case 'png':
      return 'image/png'
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    default:
      return null
  }
}

function isHeicLike(file: File, sniffed: SniffedImageFormat): boolean {
  if (sniffed === 'heic') return true
  const type = file.type.toLowerCase()
  return (
    type === 'image/heic' ||
    type === 'image/heif' ||
    type === 'image/heic-sequence' ||
    type === 'image/heif-sequence' ||
    /\.(heic|heif)$/i.test(file.name)
  )
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const { default: heic2any } = await import('heic2any')
  const converted = await heic2any({
    blob: file,
    toType: 'image/jpeg',
    quality: 0.92,
  })
  const blob = Array.isArray(converted) ? converted[0] : converted
  const baseName = file.name.replace(/\.(heic|heif)$/i, '') || 'image'
  return new File([blob], `${baseName}.jpg`, {
    type: 'image/jpeg',
    lastModified: file.lastModified,
  })
}

type DrawableSource = ImageBitmap | HTMLImageElement

async function decodeWithMime(buffer: ArrayBuffer, mime: string): Promise<DrawableSource> {
  const blob = new Blob([buffer], { type: mime })

  if (typeof ImageDecoder !== 'undefined') {
    try {
      const decoder = new ImageDecoder({ data: blob, type: mime })
      const result = await decoder.decode({ frameIndex: 0 })
      return result.image
    } catch {
      // Fall through to createImageBitmap / HTMLImageElement.
    }
  }

  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob, {
        premultiplyAlpha: 'premultiply',
        colorSpaceConversion: 'none',
      })
    } catch {
      // Fall through.
    }
  }

  const objectUrl = URL.createObjectURL(blob)
  try {
    return await loadHtmlImage(objectUrl)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function decodeUploadBuffer(
  file: File,
  buffer: ArrayBuffer,
  sniffed: SniffedImageFormat,
): Promise<DrawableSource> {
  const mimeCandidates = [
    mimeForFormat(sniffed),
    file.type || null,
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
  ].filter((mime, index, list): mime is string => Boolean(mime) && list.indexOf(mime) === index)

  let lastError: unknown = null
  for (const mime of mimeCandidates) {
    try {
      return await decodeWithMime(buffer, mime)
    } catch (err) {
      lastError = err
    }
  }

  for (const mime of mimeCandidates) {
    try {
      const dataUrl = await blobToDataUrl(new Blob([buffer], { type: mime }))
      return await loadHtmlImage(dataUrl)
    } catch (err) {
      lastError = err
    }
  }

  const message =
    lastError instanceof Error ? lastError.message : 'image decode failed'
  throw new Error(
    `${message} (declared ${file.type || 'no MIME'}, detected ${sniffed}, ${buffer.byteLength} bytes)`,
  )
}

function drawableSize(source: DrawableSource): { width: number; height: number } {
  if (source instanceof ImageBitmap) {
    return { width: source.width, height: source.height }
  }
  return { width: source.naturalWidth, height: source.naturalHeight }
}

function closeDrawable(source: DrawableSource): void {
  if (source instanceof ImageBitmap) source.close()
}

async function exportDrawableAsPng(source: DrawableSource, file: File): Promise<PreparedUploadImage> {
  const { width, height } = drawableSize(source)
  if (width < 1 || height < 1) {
    closeDrawable(source)
    throw new Error(`Image has invalid dimensions (${width}x${height})`)
  }

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    closeDrawable(source)
    throw new Error('Canvas not supported')
  }

  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, width, height)
  ctx.drawImage(source, 0, 0)
  closeDrawable(source)

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result) resolve(result)
      else reject(new Error('PNG export failed'))
    }, 'image/png')
  })

  const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
  return {
    file: new File([blob], `${baseName}.png`, {
      type: 'image/png',
      lastModified: file.lastModified,
    }),
    width,
    height,
    sniffedFormat: 'png',
    declaredType: file.type || 'no MIME type',
  }
}

/** Read dimensions from an already-stored browser-safe image blob. */
export async function readImageDimensions(
  blob: Blob,
): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob)
      const dimensions = { width: bitmap.width, height: bitmap.height }
      bitmap.close()
      return dimensions
    } catch {
      // Fall through.
    }
  }

  try {
    const url = URL.createObjectURL(blob)
    try {
      const img = await loadHtmlImage(url)
      return { width: img.naturalWidth, height: img.naturalHeight }
    } finally {
      URL.revokeObjectURL(url)
    }
  } catch {
    return null
  }
}

/** Decode camera/gallery uploads into a browser-safe PNG for pattern generation. */
export async function prepareUploadImageFile(file: File): Promise<PreparedUploadImage> {
  const buffer = await file.arrayBuffer()
  const sniffed = sniffImageFormat(new Uint8Array(buffer))

  if (isHeicLike(file, sniffed)) {
    const jpeg = await convertHeicToJpeg(
      new File([buffer], file.name, { type: file.type || 'image/heic', lastModified: file.lastModified }),
    )
    return prepareUploadImageFile(jpeg)
  }

  const drawable = await decodeUploadBuffer(file, buffer, sniffed)
  const prepared = await exportDrawableAsPng(drawable, file)
  return {
    ...prepared,
    sniffedFormat: sniffed,
    declaredType: file.type || 'no MIME type',
  }
}
