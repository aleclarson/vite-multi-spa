import fs from 'node:fs'
import path from 'node:path'
import {
  type Connect,
  type IndexHtmlTransformHook,
  normalizePath,
  type Plugin,
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
}

export default function viteMultiSpa(options: ViteMultiSpaOptions = {}) {
  let root: string

  const pagesRoot = options.pagesRoot
    ? normalizePath(options.pagesRoot).replace(/(^\/|\/$)/g, '')
    : 'src/pages'

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
          const url = req.url!
          const secFetchDest = req.headers['sec-fetch-dest']
          if (secFetchDest === 'document') {
            // Serve documents from the pages root.
            const pageUrl = resolvePageUrl(url)
            if (pageUrl) {
              req.url = pageUrl
              delete req.originalUrl
            }
          } else if (secFetchDest && req.headers['referer']) {
            if (url.startsWith('/@vite/')) {
              return next()
            }
            const referer = new URL(req.headers['referer'])
            const pageUrl = resolvePageUrl(referer.pathname)
            if (pageUrl && !fs.existsSync(path.join(root, url))) {
              // Serve assets relative to the document's filesystem location.
              const assetUrl = pageUrl.slice(0, pageUrl.lastIndexOf('/')) + url
              if (fs.existsSync(path.join(root, assetUrl))) {
                req.url = assetUrl
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
