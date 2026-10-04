import { runSweepShard } from '@/test/fixtures/avEvasionSweepRun'

// shard 1 of the parametric AV evasion sweep (4 files run in parallel); see fixtures/avEvasionSweepCases.ts
runSweepShard(1)
