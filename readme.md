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

## FAQ

- **How are my pages' `.html` files processed?** Exactly the same way Vite processes the default `index.html`—script tags bundle and can contain ESM imports, relative assets resolve from the HTML file (e.g. `<script type="module" src="main.tsx"></script>` checks `main.tsx` next to that page), and everything else that works for Vite's root HTML works per-page here.
- **Are you open to supporting templating engines?** Sure am; if you have ideas, feel free to write up a proposal, but please no unsolicited PRs for this feature.
- **Does this work with Cloudflare's [`@cloudflare/vite-plugin`](https://www.npmjs.com/package/@cloudflare/vite-plugin)?** You bet. I use those plugins together in production and made sure they play nicely.
