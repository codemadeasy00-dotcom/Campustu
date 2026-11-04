import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { createReadStream, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = dirname(fileURLToPath(import.meta.url))
const ocrAssets = new Map([
  ['worker.min.js', resolve(frontendRoot, 'node_modules/tesseract.js/dist/worker.min.js')],
  ['core/tesseract-core-lstm.wasm.js', resolve(frontendRoot, 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js')],
  ['core/tesseract-core-simd-lstm.wasm.js', resolve(frontendRoot, 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js')],
  ['core/tesseract-core-relaxedsimd-lstm.wasm.js', resolve(frontendRoot, 'node_modules/tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js')],
  ['lang/eng.traineddata.gz', resolve(frontendRoot, 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz')],
])

function localOcrAssets() {
  const assetUrlPattern = /^\/ocr\/(.+)$/

  return {
    name: 'local-ocr-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const assetName = request.url?.match(assetUrlPattern)?.[1]
        const assetPath = assetName && ocrAssets.get(assetName)
        if (!assetPath) return next()

        response.setHeader(
          'Content-Type',
          assetName.endsWith('.gz') ? 'application/gzip' : 'text/javascript',
        )
        createReadStream(assetPath).pipe(response)
      })
    },
    generateBundle() {
      for (const [fileName, sourcePath] of ocrAssets) {
        this.emitFile({
          type: 'asset',
          fileName: `ocr/${fileName}`,
          source: readFileSync(sourcePath),
        })
      }
    },
  }
}

export default defineConfig({
  publicDir: 'Icons',
  plugins: [react(), tailwindcss(), localOcrAssets()],
  server: {
    proxy: {
      '/auth': 'http://localhost:4000',
      '/meta': 'http://localhost:4000',
      '/items': 'http://localhost:4000',
      '/kits': 'http://localhost:4000',
      '/wishlist': 'http://localhost:4000',
      '/conversations': 'http://localhost:4000',
      '/moderation': 'http://localhost:4000',
      '/api': 'http://localhost:4000',
    },
  },
})
