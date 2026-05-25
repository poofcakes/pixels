const DB_NAME = 'poof-pixels-images'
const DB_VERSION = 1
const STORE = 'images'

export type StoredImageMeta = {
  id: string
  fileName: string
  mimeType: string
  updatedAt: number
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE)
      }
    }
  })
}

export async function savePatternImage(
  id: string,
  blob: Blob,
  meta: Omit<StoredImageMeta, 'id' | 'updatedAt'>,
): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    store.put(
      {
        blob,
        meta: { id, ...meta, updatedAt: Date.now() } satisfies StoredImageMeta,
      },
      id,
    )
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('save failed'))
  })
  db.close()
}

export async function loadPatternImage(
  id: string,
): Promise<{ blob: Blob; meta: StoredImageMeta } | null> {
  const db = await openDb()
  const result = await new Promise<{ blob: Blob; meta: StoredImageMeta } | null>(
    (resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => {
        const row = req.result as { blob: Blob; meta: StoredImageMeta } | undefined
        resolve(row ?? null)
      }
      req.onerror = () => reject(req.error ?? new Error('load failed'))
    },
  )
  db.close()
  return result
}

export async function deletePatternImage(id: string): Promise<void> {
  const db = await openDb()
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).delete(id)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('delete failed'))
  })
  db.close()
}

export function imageIdFromFile(file: File): string {
  return `img-${file.name}-${file.size}-${file.lastModified}`
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read failed'))
    reader.readAsDataURL(blob)
  })
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const res = await fetch(dataUrl)
  return res.blob()
}
