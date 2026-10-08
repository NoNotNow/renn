import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Every `scopeParams` key of the form `stack:<i>/member:<pipeId>:<k>/...` in the shipped example worlds must address an existing
 * member of that pipe (an off-by-one after a pipe re-order silently drops a tickEvery / layer scope).
 */
const ROOT = join(process.cwd(), 'public/exampleWorlds')

type Member = { kind: 'stage'; stageId: string } | { kind: 'pipe'; pipeId: string }
type Pipe = { members?: Member[]; stageIds?: string[] }

describe('example worlds: scopeParams member keys resolve', () => {
  for (const dir of readdirSync(ROOT)) {
    const file = join(ROOT, dir, 'world.json')
    if (!existsSync(file)) continue
    it(dir, () => {
      const world = JSON.parse(readFileSync(file, 'utf8'))
      const pipes: Record<string, Pipe> = { ...(world.transformerPipes ?? {}), ...(world.globalBehaviorLibrary?.transformerPipes ?? {}) }
      const bad: string[] = []
      for (const e of world.entities ?? []) {
        for (const [si, b] of (e.transformerPipeStack ?? []).entries()) {
          for (const key of Object.keys(b.scopeParams ?? {})) {
            let cur: string | undefined = b.pipeId
            for (const seg of key.split('/')) {
              const m = /^member:(.+):(\d+)$/.exec(seg)
              if (!m) continue
              const pipe: Pipe | undefined = cur ? pipes[cur] : undefined
              const members: Member[] | undefined = pipe?.members ?? pipe?.stageIds?.map((stageId) => ({ kind: 'stage' as const, stageId }))
              const mem = members?.[Number(m[2])]
              if (m[1] !== cur || !mem) {
                bad.push(`${e.id}[${si}] ${key} @ ${seg}`)
                break
              }
              cur = mem.kind === 'pipe' ? mem.pipeId : undefined
            }
          }
        }
      }
      expect(bad).toEqual([])
    })
  }
})
