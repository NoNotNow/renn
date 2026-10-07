/** Node-only: read exported AV-evolution runs (schema renn.av-evolution/1) from disk. */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import type { RunExport } from '../core/store'
import { isRunExport } from './readApi'

export const DEFAULT_AV_EVOLUTION_EXPORT_DIR = 'test-results/av-evolution'

export async function readExportsFromDisk(dir: string = path.resolve(process.cwd(), DEFAULT_AV_EVOLUTION_EXPORT_DIR)): Promise<RunExport[]> {
  let names: string[]
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json')).sort()
  } catch {
    return []
  }
  const out: RunExport[] = []
  for (const n of names) {
    try {
      const data: unknown = JSON.parse(await readFile(path.join(dir, n), 'utf8'))
      if (isRunExport(data)) out.push(data)
    } catch {
      // skip unreadable / non-export files
    }
  }
  return out
}
