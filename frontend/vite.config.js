import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  publicDir: 'Icons',
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/auth': 'http://localhost:4000',
      '/meta': 'http://localhost:4000',
      '/items': 'http://localhost:4000',
      '/kits': 'http://localhost:4000',
      '/wishlist': 'http://localhost:4000',
      '/conversations': 'http://localhost:4000',
      '/api': 'http://localhost:4000',
    },
  },
})
