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

const indexHtml = path.join(docsDir, 'index.html')

/** Client-side routes need a real index.html on GitHub Pages (static hosting). */
function writeSpaFallback(relativeDir) {
  const dir = path.join(docsDir, relativeDir)
  mkdirSync(dir, { recursive: true })
  cpSync(indexHtml, path.join(dir, 'index.html'))
}

// GitHub Pages SPA fallback for any path without its own index.html.
cpSync(indexHtml, path.join(docsDir, '404.html'))

// Keep in sync with BRAND_PALETTES in src/components/ColorChartPage.tsx (excludes "mixed").
const colorChartSlugs = [
  'mard',
  'perler',
  'hama',
  'artkal',
  'artkalC',
  'artkalM',
  'nabbi',
  'pyssla',
]

writeSpaFallback('colors')
for (const slug of colorChartSlugs) {
  writeSpaFallback(path.join('colors', slug))
}
writeSpaFallback('about')

// GitHub Pages: skip Jekyll when serving static assets from /docs.
writeFileSync(path.join(docsDir, '.nojekyll'), '')

console.log(`Synced ${distDir} -> ${docsDir}`)
console.log('GitHub Actions will upload docs/ as the Pages artifact.')
