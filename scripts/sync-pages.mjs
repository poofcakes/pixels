/**
 * Copy the built Vite output into docs/ for GitHub Pages.
 *
 * The pixels repo is standalone on GitHub, so Pages should publish from
 * main:/docs and only files under this directory should be committed there.
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pixelsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(pixelsDir, 'dist')
const docsDir = path.join(pixelsDir, 'docs')

if (!existsSync(distDir)) {
  throw new Error(`Build output missing: ${distDir}`)
}

if (existsSync(docsDir)) {
  rmSync(docsDir, { recursive: true, force: true })
}

mkdirSync(docsDir, { recursive: true })
cpSync(distDir, docsDir, { recursive: true })

// GitHub Pages: skip Jekyll when serving static assets from /docs.
writeFileSync(path.join(docsDir, '.nojekyll'), '')

console.log(`Synced ${distDir} -> ${docsDir}`)
console.log('GitHub Actions will upload docs/ as the Pages artifact.')
