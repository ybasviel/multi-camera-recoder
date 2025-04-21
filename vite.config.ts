import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import type { PluginOption } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [svelte(), tailwindcss()],
  worker: {
    format: 'es',
    plugins: (): PluginOption[] => []
  },
  server: {
    headers: {
      'Cross-Origin-Embedder-Policy': 'require-corp',
      'Cross-Origin-Opener-Policy': 'same-origin'
    }
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util']
  }
})
