#!/bin/bash
# B0: run the hard-constraint vitest files (sequential, one vitest per file) against the CURRENT world.json; logs to OUT/<label>_<file>.log,
# wall per file to OUT/<label>_costs.txt. Env: ACT=1 -> activation instrumentation (ACT_OUT=OUT/<label>_act). FILES overrides the file list.
# Usage: probe-run.sh OUT label
OUT=${1:-/tmp/b0}; L=${2:-base}; mkdir -p "$OUT"
FILES=${FILES:-"av-evasion-scenarios.test av-maze-scenarios.test av-evasion-scenarios.eco.test av-maze-scenarios.eco.test hunt-game.integration.test hunt-game-score.integration.test av-keep-right.test av-evasion-sweep.0.test av-evasion-sweep.1.test av-evasion-sweep.2.test av-evasion-sweep.3.test"}
CFG=""
if [ -n "$ACT" ]; then CFG="--config tools/hunt-profile-evo/probe/vitest.activation.config.ts"; export ACT_OUT="$OUT/${L}_act"; fi
for f in $FILES; do
  s=$(date +%s)
  perl -e 'alarm shift; exec @ARGV' 1500 npx vitest run $CFG src/test/scenarios/$f.ts > "$OUT/${L}_$f.log" 2>&1
  rc=$?
  echo "$f $(( $(date +%s)-s ))s rc=$rc" >> "$OUT/${L}_costs.txt"
done
