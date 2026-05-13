import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const isWindows = process.platform === 'win32'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // На Windows события файловой системы часто не доходят до watcher
    // (антивирус, OneDrive, папка Temp) — без polling изменения не триггерят HMR.
    ...(isWindows ? { watch: { usePolling: true, interval: 200 } } : {}),
  },
})
