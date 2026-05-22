# Pixel Pattern Maker

GitHub repo for `https://pixels.poofcakes.com/`.

## GitHub Actions (recommended)

Push to `main` and Actions builds + deploys automatically. No need to commit
`docs/` or run Vite locally before every deploy.

**One-time setup**

1. Settings → Pages → Build and deployment → Source: **GitHub Actions**
2. Custom domain: **pixels.poofcakes.com** (set in Pages settings; `public/CNAME`
   is copied into each build)

Workflow: `.github/workflows/pages.yml` — checks out this repo, runs
`npm run pages`, deploys the `docs/` artifact.

## Local development

From this directory:

```sh
npm install
npm run dev
npm run build
npm run preview
```

`npm run pages` builds and syncs `dist/` to `docs/` for the Actions artifact.

## Manual deploy (without Actions)

If you publish from a branch instead of Actions:

1. Pages source: **main**, folder **/docs** (not repo root)
2. `npm run pages`, commit `docs/`, push

Root `index.html` is dev-only (`./src/main.tsx`); never publish from `/ (root)`.
