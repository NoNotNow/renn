#!/bin/bash
# B0: per-file wall cost of the hard-constraint vitest files. Usage: probe-costs.sh OUTDIR [label]
OUT=${1:-/tmp/b0}; L=${2:-base}; mkdir -p "$OUT"
for f in av-evasion-scenarios.test av-maze-scenarios.test av-evasion-scenarios.eco.test av-maze-scenarios.eco.test hunt-game.integration.test hunt-game-score.integration.test av-keep-right.test av-evasion-sweep.0.test av-evasion-sweep.1.test av-evasion-sweep.2.test av-evasion-sweep.3.test; do
  s=$(date +%s)
  perl -e 'alarm shift; exec @ARGV' 1500 npx vitest run src/test/scenarios/$f.ts > "$OUT/${L}_$f.log" 2>&1
  rc=$?
  echo "$f $(( $(date +%s)-s ))s rc=$rc" >> "$OUT/${L}_costs.txt"
done
