import fs from 'node:fs'
import path from 'node:path'
import {
  type Connect,
  type IndexHtmlTransformHook,
  normalizePath,
  type Plugin,
  type Rollup,
} from 'vite'

export type ViteMultiSpaOptions = {
  /**
   * Where your pages are located. Only `.html` files are recognized.
   * @default 'src/pages'
   */
  pagesRoot?: string
  /**
   * Transform the HTML of your pages.
   * @see https://vite.dev/guide/api-plugin#transformindexhtml
   */
  transformPageHtml?: IndexHtmlTransformHook | readonly IndexHtmlTransformHook[]
  /**
   * Rewrite requests matching a pattern to a specific `.html` file.
   * The target path is resolved relative to the `pagesRoot`.
   *
   * Supports Cloudflare-style patterns:
   * - Splats: `*` (matches anything greedily)
   * - Placeholders: `:name` (matches anything until `/`)
   */
  redirects?: Record<string, string>
}

export default function viteMultiSpa(options: ViteMultiSpaOptions = {}) {
  let root: string

  const pagesRoot = options.pagesRoot
    ? normalizePath(options.pagesRoot).replace(/(^\/|\/$)/g, '')
    : 'src/pages'

  const redirects = Object.entries(options.redirects || {}).map(
    ([pattern, target]) => {
      // Escape regex characters except * and :
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&')

      // Convert splats and placeholders to capture groups
      let regexStr = '^'
      let lastIndex = 0
      const tokenRegex = /(\*)|(:[a-zA-Z_]\w*)/g
      let match

      while ((match = tokenRegex.exec(escaped))) {
        const [full, splat, placeholder] = match
        const index = match.index

        regexStr += escaped.slice(lastIndex, index)

        if (splat) {
          regexStr += '(?<splat>.*)'
        } else if (placeholder) {
          const name = placeholder.slice(1)
          regexStr += `(?<${name}>[^/]+)`
        }

        lastIndex = index + full.length
      }

      regexStr += escaped.slice(lastIndex) + '$'
      const regex = new RegExp(regexStr)

      return (url: string) => {
        const match = url.match(regex)
        if (!match) return null

        let result = target
        if (match.groups) {
          for (const [name, value] of Object.entries(match.groups)) {
            result = result.replace(new RegExp(`:${name}\\b`, 'g'), value)
          }
        }
        return normalizePath(result)
      }
    }
  )

  const resolveRedirect = (url: string) => {
    for (const match of redirects) {
      const target = match(url)
      if (target) {
        const pageUrl = target.startsWith('/') ? target : '/' + target
        return resolvePageUrl(pageUrl.replace(/\.html$/, ''))
      }
    }
  }

  // Given a request URL, return the corresponding page URL. This is used to
  // serve documents (and their relative assets) from the pages root.
  const resolvePageUrl = (url: string) => {
    const pageURL = '/' + pagesRoot + url
    if (pageURL.endsWith('/')) {
      const pageFile = path.join(root, pageURL, 'index.html')
      if (fs.existsSync(pageFile)) {
        return pageURL
      }
    } else {
      const pageFile = path.join(root, pageURL + '.html')
      if (fs.existsSync(pageFile)) {
        return pageURL
      }
    }
  }

  const transforms: IndexHtmlTransformHook[] = Array.isArray(
    options.transformPageHtml
  )
    ? options.transformPageHtml
    : options.transformPageHtml
      ? [options.transformPageHtml as IndexHtmlTransformHook]
      : []

  // In case another plugin emits HTML files, wrap custom transforms so they
  // only run on /index.html and those in the pages root.
  const transformPagesOnly = (
    transform: IndexHtmlTransformHook
  ): IndexHtmlTransformHook =>
    function (html, ctx) {
      return ctx.path.startsWith('/' + pagesRoot + '/') ||
        ctx.path === '/index.html'
        ? transform.call(this, html, ctx)
        : undefined
    }

  type PluginContext = {
    environment: { name: string }
    resolve: Rollup.PluginContext['resolve']
  }

  type PluginBuildContext = PluginContext & {
    emitFile: (file: { type: 'chunk'; id: string }) => void
  }

  // Don't use the Plugin type directly, as that more easily leads to
  // assignability errors as the Vite API evolves.
  const corePlugin = {
    name: 'vite-multi-spa',
    configResolved(config: { root: string }) {
      root = config.root
    },
    configureServer: {
      order: 'pre',
      handler(server: { middlewares: Connect.Server }) {
        server.middlewares.use((req, _res, next) => {
          const [url, query = ''] = req.url!.split('?')

          const secFetchDest = req.headers['sec-fetch-dest']
          if (secFetchDest === 'document') {
            const redirectUrl = resolveRedirect(url)
            if (redirectUrl) {
              req.url = redirectUrl + (query ? '?' + query : '')
              delete req.originalUrl
              return next()
            }

            // Serve documents from the pages root.
            const pageUrl = resolvePageUrl(url)
            if (pageUrl) {
              req.url = pageUrl + (query ? '?' + query : '')
              delete req.originalUrl
            }
          } else if (secFetchDest && req.headers['referer']) {
            if (url.startsWith('/@vite/')) {
              return next()
            }

            const referer = new URL(req.headers['referer'])
            const pageUrl =
              resolveRedirect(referer.pathname) ||
              resolvePageUrl(referer.pathname)

            if (pageUrl && !fs.existsSync(path.join(root, url))) {
              // Serve assets relative to the document's filesystem location.
              const assetUrl = pageUrl.slice(0, pageUrl.lastIndexOf('/')) + url
              if (fs.existsSync(path.join(root, assetUrl))) {
                req.url = assetUrl + (query ? '?' + query : '')
                delete req.originalUrl
              }
            }
          }

          next()
        })
      },
    },
    transformIndexHtml:
      transforms.length > 0
        ? { order: 'pre' as const, handler: transformPagesOnly(transforms[0]) }
        : undefined,
    // Resolve `import` statements in `.html` files’ <script> tags.
    resolveId(this: PluginContext, id: string, importer: string | undefined) {
      if (!importer) return
      if (importer[0] !== '\0') return
      if (!importer.includes('?html-proxy')) return

      const importerFile = normalizePath(importer.slice(1).replace(/\?.*$/, ''))
      if (importerFile.startsWith(root + '/' + pagesRoot + '/')) {
        return this.resolve(id, importerFile, {
          skipSelf: true,
        })
      }
    },
  } as const

  // Is the plugin adherent to Vite's plugin API?
  corePlugin satisfies Plugin

  const buildPlugin = {
    name: 'vite-multi-spa:build',
    apply: 'build',
    buildStart(this: PluginBuildContext) {
      if (this.environment.name !== 'client') {
        return
      }
      fs.globSync(path.join(root, pagesRoot + '/**/*.html')).forEach(file => {
        this.emitFile({
          type: 'chunk',
          id: path.relative(root, file),
        })
      })
    },
    generateBundle: {
      order: 'post',
      handler(this: PluginContext, _options, bundle) {
        if (this.environment.name !== 'client') {
          return
        }
        // Flatten the pages root into the root.
        for (const filename in bundle) {
          const file = bundle[filename]
          if (
            file.type === 'asset' &&
            file.fileName.startsWith(pagesRoot + '/')
          ) {
            file.fileName = file.fileName.slice(pagesRoot.length + 1)
          }
        }
      },
    } satisfies Plugin['generateBundle'],
  } as const

  buildPlugin satisfies Plugin

  return [
    corePlugin,
    buildPlugin,
    ...transforms.slice(1).map(
      transform =>
        ({
          name: 'vite-multi-spa:transform-html',
          transformIndexHtml: {
            order: 'pre',
            handler: transformPagesOnly(transform),
          },
        }) satisfies Plugin
    ),
  ]
}
