#!/bin/bash
# B0: set the AV binding of the CURRENT worktree's self_hunt_flexible world.json to a mazeProfile set, run the constraint files with the
# activation/hash instrumentation (probe-run.sh ACT=1), then restore world.json. Usage: run-profile.sh OUT label <set.json|none>
OUT=$1; L=$2; SET=$3
W=public/exampleWorlds/self_hunt_flexible/world.json
cp "$W" "$OUT/.world.orig.json"
if [ "$SET" != "none" ]; then node tools/hunt-maze/apply-set.mjs "$SET" > /dev/null; fi
rm -f "$OUT/${L}_costs.txt"
ACT=1 FILES="$FILES" bash tools/hunt-profile-evo/probe/probe-run.sh "$OUT" "$L" > /dev/null 2>&1
cp "$OUT/.world.orig.json" "$W"
