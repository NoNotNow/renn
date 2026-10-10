#!/usr/bin/env bash
# Resumable v3 training (forward + reverse, free-track pretraining -> obstacle curriculum, kind-evenness fitness).
# Works on Linux and macOS. State lives in the TRACKED file training-data/policy-evolution/v3.json (commit it to hand a run over).
#
#   tools/policy-evolution/run-v3.sh [TOTAL_GENERATIONS=3000] [WORKERS=cores-1]
#
# Stop any time (Ctrl+C): state is saved every generation; re-run the same command to continue.
# Then: npx tsx tools/policy-evolution/ship.ts training-data/policy-evolution/v3.json --v3 --workers N  (writes shippedPolicyV3.json only if better)
set -euo pipefail
cd "$(dirname "$0")/../.."
TOTAL=${1:-3000}
CORES=$( (command -v nproc >/dev/null && nproc) || sysctl -n hw.ncpu)
WORKERS=${2:-$((CORES > 1 ? CORES - 1 : 1))}
OUT=${V3_OUT:-training-data/policy-evolution/v3.json}
LOG=${V3_LOG:-${OUT%.json}.log}
EXTRA=${V3_EXTRA_ARGS:-}   # e.g. V3_EXTRA_ARGS="--speed-cap 15 --warm FILE" (only used when creating a new OUT; default unchanged)
DONE=0
[ -f "$OUT" ] && DONE=$(node -e "console.log(JSON.parse(require('fs').readFileSync('$OUT','utf8')).state.gen)")
REM=$((TOTAL - DONE))
if [ "$REM" -le 0 ]; then echo "already at generation $DONE >= $TOTAL"; exit 0; fi
RES=""
[ "$DONE" -gt 0 ] && RES="--resume"
echo "v3: generation $DONE -> $TOTAL with $WORKERS workers (log: $LOG)"
npx tsx tools/policy-evolution/run-islands.ts --v3 --hidden 24 --batch 1 --gens "$REM" --workers "$WORKERS" --seed 21 --out "$OUT" $RES $EXTRA 2>&1 | tee -a "$LOG"
