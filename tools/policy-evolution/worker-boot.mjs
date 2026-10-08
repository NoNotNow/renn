// Worker bootstrap: registers tsx (TS + tsconfig `@/` paths) inside the worker thread, then loads the real worker.
import { register } from 'tsx/esm/api'

register()
await import('./worker.ts')
