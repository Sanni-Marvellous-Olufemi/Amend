import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { buildManifest } from './manifest.config.ts'

function manifestPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'amend-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(buildManifest(env), null, 2),
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), tailwindcss(), manifestPlugin(env)],
    resolve: { alias: { '@': resolve(__dirname, 'src') } },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'chrome116',
      rollupOptions: {
        input: {
          sidepanel: resolve(__dirname, 'sidepanel.html'),
          background: resolve(__dirname, 'src/background/index.ts'),
        },
        output: {
          entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js'),
        },
      },
    },
  }
})
