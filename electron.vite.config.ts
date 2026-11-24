import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'
import { readFileSync } from 'fs'

// The package doesn't export its package.json, so the renderer can't import it.
const bedwareUiVersion: string = JSON.parse(
  readFileSync(resolve(__dirname, 'node_modules/@bedware/ui/package.json'), 'utf8')
).version

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'out/main'
    }
  },
  preload: {
    // @bedware/ui (its vim-keys entry, src/shared/vim-keys.ts) is bundled in:
    // it is ESM, which a page's sandboxed preload can't require.
    plugins: [externalizeDepsPlugin({ exclude: ['@bedware/ui'] })],
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          'webview-stealth': resolve(__dirname, 'src/preload/webview-stealth.ts'),
          'extension-shim': resolve(__dirname, 'src/preload/extension-shim.ts'),
        }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    define: {
      __BEDWARE_UI_VERSION__: JSON.stringify(bedwareUiVersion)
    },
    build: {
      outDir: resolve(__dirname, 'out/renderer'),
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
          dropdown: resolve(__dirname, 'src/renderer/dropdown.html'),
          omnibox: resolve(__dirname, 'src/renderer/omnibox.html'),
          'update-toast': resolve(__dirname, 'src/renderer/update-toast.html')
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
