import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { logicVerificationBrowserBridgeVitePlugin } from './src/agent/logicVerificationBrowserBridgeVitePlugin'

export default defineConfig({
  base: '/renn/',
  plugins: [react(), logicVerificationBrowserBridgeVitePlugin()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    execArgv: ['--expose-gc'],
  },
})
