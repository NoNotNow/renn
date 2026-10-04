/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RENN_MCP_DEV_TOKEN?: string
  readonly VITE_RENN_MCP_BROWSER_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** git short SHA (+dirty) at build time, injected by vite.config.ts */
declare const __BUILD_SHA__: string
