# Pixel Pattern Maker

Standalone static build of the bead pattern generator.

The app reuses code from the main site (`src/components`, `src/lib`, `messages`)
via Vite aliases — it is not a second copy of the generator. Static assets
(example images) live in the repo root `public/` folder only.

## Local Preview

```sh
npm run pixels:dev
```

## Static Build

```sh
npm run pixels:build
npm run pixels:preview
```

The Vite build uses `base: './'`, so generated CSS and JS assets are relative to
`index.html`. The same `dist/` output can be served from either:

- `https://poofcakes.github.io/pixels/`
- `https://pixels.poofcakes.com/`

`public/CNAME` is copied into `dist/` for the custom domain when publishing this
as a GitHub Pages project site.
