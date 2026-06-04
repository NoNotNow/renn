import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const glossaryPath = path.join(root, 'src/components/transformerDocs/content/glossary.yaml')
const outPath = path.join(root, 'src/components/transformerDocs/glossaryKeys.ts')

const data = parse(fs.readFileSync(glossaryPath, 'utf8'))
const keys = Object.keys(data).sort()
const union = keys.map(k => JSON.stringify(k)).join(' | ')

fs.writeFileSync(
  outPath,
  `// Auto-generated from content/glossary.yaml — run: npm run generate:glossary-keys\nexport type TransformerDocsGlossaryKey = ${union}\n`,
)

console.log(`Wrote ${keys.length} glossary keys to glossaryKeys.ts`)
