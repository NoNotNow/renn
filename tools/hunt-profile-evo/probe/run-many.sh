#!/bin/bash
# B0: sequentially run run-profile.sh for "label=setfile" pairs. Usage: run-many.sh OUT label=set.json|none ...
OUT=$1; shift
for kv in "$@"; do
  bash tools/hunt-profile-evo/probe/run-profile.sh "$OUT" "${kv%%=*}" "${kv#*=}"
  echo "done ${kv%%=*}" >> "$OUT/many.log"
done
