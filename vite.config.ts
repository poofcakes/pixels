import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const dirname = path.dirname(fileURLToPath(import.meta.url))

function copyCname(): Plugin {
  return {
    name: 'copy-cname',
    closeBundle() {
      const source = path.resolve(dirname, 'public/CNAME')
      const target = path.resolve(dirname, 'dist/CNAME')
      fs.copyFileSync(source, target)
    },
  }
}

export default defineConfig({
  root: dirname,
  base: './',
  publicDir: path.resolve(dirname, '../public'),
  plugins: [react(), copyCname()],
  resolve: {
    alias: {
      '@': path.resolve(dirname, '../src'),
      'next-intl': path.resolve(dirname, './src/next-intl-shim.tsx'),
    },
  },
  build: {
    outDir: path.resolve(dirname, 'dist'),
    emptyOutDir: true,
  },
})
