/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RENN_MCP_DEV_TOKEN?: string
  readonly VITE_RENN_MCP_BROWSER_PORT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
