#!/bin/bash
# capacity screening H=10 vs H=24, two seeds; resumable (continues each run up to 150 generations)
cd "$(dirname "$0")/../.."
for spec in "24 1" "10 1" "24 2" "10 2"; do
  set -- $spec; H=$1; S=$2; OUT=test-results/policy-evolution/h$H-s$S.json
  DONE=0; [ -f $OUT ] && DONE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT','utf8')).state.gen)")
  REM=$((150 - DONE)); [ $REM -le 0 ] && continue
  RES=""; [ $DONE -gt 0 ] && RES="--resume"
  npx tsx tools/policy-evolution/run-islands.ts --v2 --warm src/policyEvolution/shippedPolicyV2.json --hidden $H --train-per-kind 40 --holdout-per-kind 10 --batch 6 --gens $REM --workers 4 --seed $S --out $OUT $RES >> test-results/policy-evolution/h$H-s$S.log 2>&1
done
echo SCREEN DONE
