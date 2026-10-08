import { defineConfig, mergeConfig } from 'vitest/config'
import base from '../../../vite.config'
export default mergeConfig(base, defineConfig({
  test: { setupFiles: ['src/test/setup.ts', 'tools/hunt-profile-evo/probe/activation-setup.ts'] },
}))
