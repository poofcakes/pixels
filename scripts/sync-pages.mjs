/**
 * Copy the built Vite output into docs/ for GitHub Pages.
 *
 * The pixels repo is standalone on GitHub, so Pages should publish from
 * main:/docs and only files under this directory should be committed there.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pixelsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const distDir = path.join(pixelsDir, 'dist')
const docsDir = path.join(pixelsDir, 'docs')
const cnamePath = path.join(pixelsDir, 'public/CNAME')

if (!existsSync(distDir)) {
  throw new Error(`Build output missing: ${distDir}`)
}

if (existsSync(docsDir)) {
  rmSync(docsDir, { recursive: true, force: true })
}

mkdirSync(docsDir, { recursive: true })
cpSync(distDir, docsDir, { recursive: true })

const cname = readFileSync(cnamePath, 'utf8').trim()
if (!cname) {
  throw new Error(`Custom domain is missing from ${cnamePath}`)
}
writeFileSync(path.join(docsDir, 'CNAME'), `${cname}\n`)

const colorsDir = path.join(docsDir, 'colors')
mkdirSync(colorsDir, { recursive: true })
cpSync(path.join(docsDir, 'index.html'), path.join(colorsDir, 'index.html'))

// GitHub Pages: skip Jekyll when serving static assets from /docs.
writeFileSync(path.join(docsDir, '.nojekyll'), '')

console.log(`Synced ${distDir} -> ${docsDir}`)
console.log('GitHub Actions will upload docs/ as the Pages artifact.')
