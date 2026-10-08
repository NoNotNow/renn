// Compare two av:quick raw outputs row by row (status, goal time, reversals, contact frames, reversal distance). Usage: node tools/hunt-maze/avq-compare.mjs <before.txt> <after.txt>
import fs from 'node:fs'
const parse = (f) => {
  const rows = new Map()
  for (const l of fs.readFileSync(f, 'utf8').replace(/\u001b\[[0-9;]*m/g, '').split('\n')) {
    const m = l.match(/^(PASS|FAIL) (\S+)\s+(.*)$/)
    if (!m || rows.has(m[2])) continue
    const s = m[3]
    const goal = s.match(/goal ([\d.]+) s|goal (never)/)
    const rev = s.match(/\brev (\d+) \(([\d.]+) m/)
    const st = s.match(/static (\d+)f/) ?? s.match(/contact\s+(\d+)f/)
    const ch = s.match(/chaser (\d+)f/)
    const gap = s.match(/minChaserGap\s+([\d.]+)/)
    rows.set(m[2], { st: m[1], goal: goal ? (goal[2] ?? goal[1]) : '-', rev: rev ? rev[1] : '-', revm: rev ? rev[2] : '-', stat: st ? st[1] : '-', ch: ch ? ch[1] : '-', gap: gap ? gap[1] : '-' })
  }
  return rows
}
const [a, b] = [parse(process.argv[2]), parse(process.argv[3])]
console.log('| row | status | goal s | reversals | rev m | static f | chaser f | minChaserGap | verdict |')
console.log('|---|---|---|---|---|---|---|---|---|')
let better = 0, worse = 0, same = 0
for (const [n, x] of a) {
  const y = b.get(n)
  if (!y) continue
  const cell = (k) => (x[k] === y[k] ? x[k] : `${x[k]} -> ${y[k]}`)
  const rank = (r) => (r.st === 'PASS' ? 0 : 1)
  const num = (v) => (v === 'never' ? 1e9 : v === '-' ? 0 : Number(v))
  let v = 'same'
  if (rank(y) > rank(x)) v = 'worse'
  else if (rank(y) < rank(x)) v = 'better'
  else if (num(y.goal) > num(x.goal) + 0.5 || num(y.stat) > num(x.stat) || num(y.ch) > num(x.ch)) v = 'worse'
  else if (num(y.goal) < num(x.goal) - 0.5 || num(y.stat) < num(x.stat) || num(y.ch) < num(x.ch)) v = 'better'
  if (v === 'better') better++
  else if (v === 'worse') worse++
  else same++
  console.log(`| ${n} | ${cell('st')} | ${cell('goal')} | ${cell('rev')} | ${cell('revm')} | ${cell('stat')} | ${cell('ch')} | ${cell('gap')} | ${v} |`)
}
console.log(`\nbetter ${better}, worse ${worse}, same ${same} (rows ${a.size})`)
