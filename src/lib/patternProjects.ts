import type { BeadPaletteId } from '@/lib/beadPalettes'
import type { BeadMatchMethod } from '@/lib/beadColorMatch'
import type { PegboardAnchor } from '@/lib/beadPattern'
import {
  blobToDataUrl,
  dataUrlToBlob,
  deletePatternImage,
  loadPatternImage,
  savePatternImage,
} from '@/lib/patternImageStorage'

export const PROJECT_SCHEMA_VERSION = 1
export const PROJECTS_STORAGE_KEY = 'craft-pattern-projects-v1'
export const AUTOSAVE_SESSION_KEY = 'craft-pattern-autosave-v1'
export const RESTORE_DISMISSED_KEY = 'craft-pattern-restore-dismissed-v1'

export type CellEditMap = Record<string, string | null>

export type PatternProjectSettings = {
  paletteId: BeadPaletteId
  mixedBrandIds: BeadPaletteId[]
  paletteLimit: number | null
  targetCanvasWidth: number | null
  pegboardSize: number | null
  pegboardAnchor: PegboardAnchor
  pixelBlockSize: number | 'auto'
  matchMethod: BeadMatchMethod
  trimTransparent: boolean
  removeBackground: boolean
  restrictToStock: boolean
  enabledStock: string[]
  usePaletteColors: boolean
  showCodes: boolean
  showGridGuidesOnTop: boolean
  cellPx: number
}

export type PatternProjectState = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  imageId: string
  imageFileName: string
  imageMimeType: string
  settings: PatternProjectSettings
  colorOverrides: Record<string, string>
  cellEdits: CellEditMap
  completedCodes: string[]
  thumbnailDataUrl?: string
}

export type AutosaveSession = {
  projectId: string | null
  imageId: string
  settings: PatternProjectSettings
  colorOverrides: Record<string, string>
  cellEdits: CellEditMap
  completedCodes: string[]
  updatedAt: number
}

export type PortableProjectFile = {
  schemaVersion: number
  exportedAt: number
  project: Omit<PatternProjectState, 'id' | 'createdAt' | 'updatedAt'>
  imageDataUrl: string
  imageFileName: string
  imageMimeType: string
}

type PortableProjectEntry = Omit<PortableProjectFile, 'schemaVersion' | 'exportedAt'>

export type PortableProjectsFile = {
  schemaVersion: number
  exportedAt: number
  projects: PortableProjectEntry[]
}

export type ProjectImportMode = 'append' | 'replace'

export function loadProjects(): PatternProjectState[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(PROJECTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidProject)
  } catch {
    return []
  }
}

function isValidProject(value: unknown): value is PatternProjectState {
  if (!value || typeof value !== 'object') return false
  const p = value as PatternProjectState
  return (
    typeof p.id === 'string' &&
    typeof p.name === 'string' &&
    typeof p.imageId === 'string' &&
    p.settings !== null &&
    typeof p.settings === 'object'
  )
}

export function saveProjects(projects: PatternProjectState[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects))
}

export function createProjectId(): string {
  return `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function loadAutosave(): AutosaveSession | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(AUTOSAVE_SESSION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AutosaveSession
  } catch {
    return null
  }
}

export function saveAutosave(session: AutosaveSession): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(AUTOSAVE_SESSION_KEY, JSON.stringify(session))
}

export function clearAutosave(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(AUTOSAVE_SESSION_KEY)
}

export function isRestoreDismissed(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(RESTORE_DISMISSED_KEY) === '1'
}

export function setRestoreDismissed(dismissed: boolean): void {
  if (typeof window === 'undefined') return
  if (dismissed) localStorage.setItem(RESTORE_DISMISSED_KEY, '1')
  else localStorage.removeItem(RESTORE_DISMISSED_KEY)
}

export async function exportProjectFile(
  project: PatternProjectState,
): Promise<Blob> {
  const portable = await portableProjectEntry(project)
  const file: PortableProjectFile = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    ...portable,
  }

  return new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
}

export async function exportProjectsFile(
  projects: PatternProjectState[],
): Promise<Blob> {
  const portable: PortableProjectsFile = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    exportedAt: Date.now(),
    projects: await Promise.all(projects.map(portableProjectEntry)),
  }

  return new Blob([JSON.stringify(portable, null, 2)], { type: 'application/json' })
}

async function portableProjectEntry(
  project: PatternProjectState,
): Promise<PortableProjectEntry> {
  const stored = await loadPatternImage(project.imageId)
  if (!stored) throw new Error('Image not found for export')

  const dataUrl = await blobToDataUrl(stored.blob)
  return {
    project: {
      name: project.name,
      imageId: project.imageId,
      imageFileName: project.imageFileName,
      imageMimeType: project.imageMimeType,
      settings: project.settings,
      colorOverrides: project.colorOverrides,
      cellEdits: project.cellEdits,
      completedCodes: project.completedCodes,
      thumbnailDataUrl: project.thumbnailDataUrl,
    },
    imageDataUrl: dataUrl,
    imageFileName: project.imageFileName,
    imageMimeType: project.imageMimeType,
  }
}

export async function importProjectFile(file: File): Promise<PatternProjectState> {
  const projects = await importProjectFiles(file)
  if (!projects[0]) throw new Error('No projects in file')
  return projects[0]
}

export async function importProjectFiles(
  file: File,
  mode: ProjectImportMode = 'append',
): Promise<PatternProjectState[]> {
  const text = await file.text()
  const parsed = JSON.parse(text) as PortableProjectFile | PortableProjectsFile

  if (parsed.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    throw new Error('Unsupported project file version')
  }

  const entries: PortableProjectEntry[] = 'projects' in parsed
    ? parsed.projects
    : [
        {
          project: parsed.project,
          imageDataUrl: parsed.imageDataUrl,
          imageFileName: parsed.imageFileName,
          imageMimeType: parsed.imageMimeType,
        },
      ]
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error('No projects in file')
  }

  const imported = await Promise.all(entries.map(importPortableProjectEntry))
  const projects = loadProjects()
  saveProjects(mode === 'replace' ? imported : [...imported, ...projects])

  return imported
}

async function importPortableProjectEntry(
  parsed: PortableProjectEntry,
): Promise<PatternProjectState> {
  const imageId = createProjectId()
  const blob = await dataUrlToBlob(parsed.imageDataUrl)
  await savePatternImage(imageId, blob, {
    fileName: parsed.imageFileName,
    mimeType: parsed.imageMimeType,
  })

  const now = Date.now()
  const project: PatternProjectState = {
    id: createProjectId(),
    name: parsed.project.name || parsed.imageFileName || 'Imported project',
    createdAt: now,
    updatedAt: now,
    imageId,
    imageFileName: parsed.imageFileName,
    imageMimeType: parsed.imageMimeType,
    settings: parsed.project.settings,
    colorOverrides: parsed.project.colorOverrides ?? {},
    cellEdits: parsed.project.cellEdits ?? {},
    completedCodes: parsed.project.completedCodes ?? [],
    thumbnailDataUrl: parsed.project.thumbnailDataUrl,
  }

  return project
}

export async function deleteProjectWithImage(projectId: string): Promise<void> {
  const projects = loadProjects()
  const project = projects.find((p) => p.id === projectId)
  const remaining = projects.filter((p) => p.id !== projectId)
  if (project && !remaining.some((p) => p.imageId === project.imageId)) {
    await deletePatternImage(project.imageId).catch(() => undefined)
  }
  saveProjects(remaining)
}

export async function deleteAllProjectsWithImages(): Promise<void> {
  const projects = loadProjects()
  const imageIds = new Set(projects.map((project) => project.imageId))
  await Promise.all(
    [...imageIds].map((imageId) => deletePatternImage(imageId).catch(() => undefined)),
  )
  saveProjects([])
}
