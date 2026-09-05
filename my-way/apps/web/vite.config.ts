import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'

import aitDevtools from '@apps-in-toss/devtools/unplugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [aitDevtools.vite(), react(), babel({ presets: [reactCompilerPreset()] })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      // 문항 원본은 저장소 루트의 data/ 에 있어요. (CLAUDE.md §3)
      '@content': fileURLToPath(new URL('../../data', import.meta.url)),
    },
  },
  server: {
    proxy: {
      // 프론트는 우리 백엔드만 호출해요. career.go.kr 직접 호출 금지. (CLAUDE.md §2.1)
      '/api': { target: 'http://127.0.0.1:3000', changeOrigin: true },
    },
  },
})
