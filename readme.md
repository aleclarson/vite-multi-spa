# vite-multi-spa

Vite plugin that lets every `.html` in `src/pages` behave like its own SPA entry during dev and build.

## Quick start

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import viteMultiSpa from 'vite-multi-spa'

export default defineConfig({
  plugins: [
    viteMultiSpa({
      pagesRoot: 'src/pages', // optional
      // transformPageHtml: html => html, // optional, supports array
    }),
  ],
})
```

## What it does

- Serves documents from `pagesRoot` when the browser requests `/foo` or `/foo/`.
- Serves page-relative assets when requested from a page (based on the Referer header).
- Runs `transformPageHtml` only on `/index.html` and pages under `pagesRoot`.
- Emits every `${pagesRoot}/**/*.html` as a build chunk and flattens outputs to the root of `dist`.

## Options

- `pagesRoot` (`string`, default `src/pages`): Folder scanned for `.html` pages.
- `transformPageHtml` (`IndexHtmlTransformHook | IndexHtmlTransformHook[]`): Passed through to Vite and scoped to pages. See [Vite's API documentation](https://vite.dev/guide/api-plugin#transformindexhtml).

## Example

See the [`example` branch](https://github.com/aleclarson/vite-multi-spa/tree/example), run `pnpm install && pnpm dev`, and you will observe `src/pages/contact.html` served in dev mode and emitted through the build so SPA behavior is obvious in both scenarios.
