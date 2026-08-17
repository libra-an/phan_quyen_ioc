import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    open : true,
    proxy: {
      '/api-eioc': {
        target: 'https://kyta.fpt.com/eioc',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-eioc/, ''),
      },
      '/api-auth': {
        target: 'https://eaccount.kyta.fpt.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-auth/, ''),
      }
    }
  }
})