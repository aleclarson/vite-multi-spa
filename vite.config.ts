import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import multiSpa from 'vite-multi-spa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), multiSpa()],
})
