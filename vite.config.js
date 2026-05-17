import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  optimizeDeps: {
    include: ['@react-pdf/renderer'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@react-pdf')) return 'vendor-pdf'
          if (id.includes('@dnd-kit'))   return 'vendor-dnd'
          if (id.includes('@tiptap'))    return 'vendor-tiptap'
          if (id.includes('@supabase'))  return 'vendor-supabase'
          if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/') || id.includes('react-router')) return 'vendor-react'
        },
      },
    },
  },
})
