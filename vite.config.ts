import { loadEnv, type Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** index.html 의 __SITE_URL__ 을 배포 도메인으로 치환 (OG 이미지는 절대 URL 이어야 한다). */
function siteUrl(env: Record<string, string>): Plugin {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  const url = (env.VITE_SITE_URL || (vercel ? `https://${vercel}` : '')).replace(/\/$/, '')
  return { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('__SITE_URL__', url) }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), tailwindcss(), siteUrl(env)],
    build: {
      chunkSizeWarningLimit: 1200,
    },
    test: { include: ['tests/**/*.test.ts'] },
  }
})
