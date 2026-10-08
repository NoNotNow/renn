#!/bin/bash
# B0: run the proxy (vitest entry) for several set files and both budgets. Usage: proxy-all.sh OUT label=set.json|none ...
# Writes OUT/px_<label>_<budget>.json and OUT/px_<label>_<budget>.txt, wall per run in OUT/px_wall.txt
OUT=$1; shift
CASES=${CASES:-"turnaround-corridor,maze-dead-end,maze-u-trap,maze-u-trap-inside,maze-corridor-chase,maze-gate-exit,pocket-escape,pocket-ghost,s-chicane,s-bend-14,s-bend-14-short,mazemod-one-exit,mazemod-two-exits,mazemod-dead-end-branch,corridor-block,reverse-escape,boxed-in-corner,wide-berth-open-field,open-road-reverse,kr-right,kr-left,kr-old-hits"}
for kv in "$@"; do
  L=${kv%%=*}; S=${kv#*=}
  for B in full eco; do
    s=$(date +%s)
    PROXY_SET=$S PROXY_CASES=$CASES PROXY_BUDGET=$B PROXY_OUT=$OUT/px_${L}_$B.json perl -e 'alarm shift; exec @ARGV' 900 npx vitest run tools/hunt-profile-evo/probe/proxy.test.ts > $OUT/px_${L}_$B.log 2>&1
    echo "$L $B $(( $(date +%s)-s ))s" >> $OUT/px_wall.txt
  done
done
