import type { GeneSpec, GenomeSpec, Params } from '../core/genes'

/**
 * Gene spec of the AV stack tuned by the maze-escape evolution (generated from the M1 gene list, specVersion 1; P1 genes added in specVersion 2).
 * Genes are applied as AV pipe binding params on the car (binding > stage defaults). Every default equals the effective value
 * of the car in the maze episodes (saver off, like the baseline), so the all-default genome reproduces the baseline run.
 *
 * To add genes: append entries to AV_GENES_EXTRA (same defaults as the stage code) and bump AV_SPEC_VERSION.
 * Threat / flee genes are intentionally excluded (no threats in the maze episodes).
 */

const f = (key: string, def: number, group: string, min: number, max: number, scale: 'lin' | 'log' = 'lin'): GeneSpec => ({ key, type: 'float', default: def, group, min, max, scale })
const i = (key: string, def: number, group: string, min: number, max: number, scale: 'lin' | 'log' = 'lin'): GeneSpec => ({ key, type: 'int', default: def, group, min, max, scale })
const b = (key: string, def: boolean, group: string): GeneSpec => ({ key, type: 'bool', default: def, group })

export const AV_SPEC_VERSION = '5'

const AV_GENES_M1: GeneSpec[] = [
  f('maxLatAccel', 9, 'turn', 6, 30, 'lin'),
  f('comfortDecel', 4, 'speed', 2.5, 12, 'lin'),
  f('minSpeed', 9.4, 'speed', 3, 18, 'lin'),
  f('cruiseSpeed', 1000, 'speed', 25, 1000, 'log'),
  f('obstacleSlowRadius', 1, 'speed', 0, 5, 'lin'),
  f('obstacleSlowFactor', 0.5, 'speed', 0.2, 1, 'lin'),
  f('stopMargin', 1.2, 'safety', 0.2, 3, 'lin'),
  f('curveSmooth', 0.6, 'turn', 0, 1.5, 'lin'),
  f('curveDeadband', 0.004, 'turn', 0, 0.015, 'lin'),
  f('goalDecel', 3, 'speed', 2, 10, 'lin'),
  f('goalCrawlSpeed', 2, 'speed', 1, 6, 'lin'),
  f('tau', 0.12, 'control', 0.05, 0.4, 'log'),
  f('maxAccel', 60, 'control', 15, 150, 'log'),
  f('maxDecel', 12, 'control', 6, 40, 'lin'),
  f('ki', 0.6, 'control', 0, 2, 'lin'),
  f('breakawayRate', 0.5, 'control', 0.2, 3, 'log'),
  f('fbGain', 0.35, 'control', 0, 1, 'lin'),
  f('steerRate', 4, 'control', 1.5, 20, 'log'),
  f('kappaTau', 0.04, 'control', 0.01, 0.2, 'log'),
  f('kappaJump', 0.025, 'control', 0.01, 0.07, 'lin'),
  b('purePursuit', true, 'control'),
  f('ppWindow', 0.02, 'control', 0.005, 0.06, 'lin'),
  f('ppMaxKappa', 0.04, 'control', 0.02, 0.115, 'lin'),
  f('kappaDeadband', 0.0015, 'control', 0, 0.006, 'lin'),
  f('safetyMargin', 0.5, 'safety', 0.05, 1, 'lin'),
  f('marginSpeedGain', 0.05, 'safety', 0, 0.1, 'lin'),
  f('softMargin', 1.1, 'safety', 0.3, 2, 'lin'),
  f('minFree', 4.5, 'trigger', 1, 8, 'lin'),
  f('horizonMin', 10, 'perception', 5, 30, 'lin'),
  f('horizonGain', 1.2, 'perception', 0.5, 2.5, 'lin'),
  f('horizonMax', 150, 'perception', 30, 150, 'lin'),
  f('wProgress', 1, 'turn', 0.3, 3, 'log'),
  f('wHeading', 2, 'turn', 0, 6, 'lin'),
  f('wRequired', 300, 'safety', 30, 600, 'log'),
  f('wFree', 10, 'safety', 0, 30, 'lin'),
  f('wSoft', 8, 'safety', 0, 30, 'lin'),
  f('wSmooth', 2.5, 'control', 0, 8, 'lin'),
  f('wTurn', 1.5, 'turn', 0, 6, 'lin'),
  f('switchMargin', 3, 'turn', 0, 10, 'lin'),
  f('marginRamp', 3, 'safety', 1, 8, 'lin'),
  f('rearIgnore', 1.4, 'safety', 0, 4, 'lin'),
  f('fixAimDeg', 35, 'trigger', 15, 60, 'lin'),
  f('fixDynRange', 12, 'trigger', 4, 25, 'lin'),
  f('fixDynBand', 6, 'trigger', 2, 12, 'lin'),
  f('planMargin', 0.4, 'safety', 0.05, 0.8, 'lin'),
  f('tightMargin', 0.1, 'safety', 0, 0.3, 'lin'),
  f('guardMargin', 0.15, 'safety', 0, 0.4, 'lin'),
  f('handbackMargin', 0.9, 'trigger', 0.2, 1.5, 'lin'),
  f('handbackFree', 10, 'trigger', 4, 25, 'lin'),
  f('routeInterval', 0.8, 'trigger', 0.3, 2, 'log'),
  f('lookahead', 14, 'route', 8, 30, 'lin'),
  f('carrotLookT', 1.6, 'turn', 0.6, 3.5, 'lin'),
  f('carrotPullCos', 0.94, 'turn', 0.8, 0.99, 'lin'),
  f('stuckTime', 1.5, 'trigger', 0.5, 3, 'lin'),
  f('blockedTime', 0.4, 'trigger', 0.15, 1.5, 'lin'),
  f('stallTime', 1.2, 'trigger', 0.5, 3, 'lin'),
  f('crawlTime', 6, 'trigger', 2, 12, 'lin'),
  f('restWaitMax', 1.2, 'maneuver', 0.3, 2.5, 'lin'),
  f('maxOffPath', 6, 'maneuver', 3, 12, 'lin'),
  f('contactRestTime', 1, 'trigger', 0.3, 3, 'lin'),
  f('contactTtl', 25, 'route', 5, 60, 'lin'),
  f('maneuverSpeed', 3, 'maneuver', 2, 8, 'lin'),
  f('maneuverRunSpeed', 7, 'maneuver', 3, 15, 'lin'),
  f('mazeManeuverSpeed', 3, 'maneuver', 3, 10, 'lin'),
  f('turnManeuverSpeed', 4.5, 'maneuver', 3, 10, 'lin'),
  f('mazeDetour', 15, 'trigger', 4, 40, 'lin'),
  f('mazeDeviate', 2.5, 'trigger', 1, 6, 'lin'),
  f('mazeReversePenalty', 1.5, 'maneuver', 0.3, 4, 'lin'),
  f('mazeMaxReverseRun', 40, 'maneuver', 10, 80, 'lin'),
  f('reversePenalty', 4, 'maneuver', 1, 8, 'lin'),
  f('gearSwitchPenalty', 4, 'maneuver', 1, 10, 'lin'),
  f('maxReverseRun', 8, 'maneuver', 3, 20, 'lin'),
  b('reverseCruise', true, 'maneuver'),
  f('reverseSpeed', 10, 'maneuver', 4, 20, 'lin'),
  b('turnAround', true, 'turn'),
  f('turnRoom', 20, 'turn', 10, 35, 'lin'),
  f('turnDeviate', 2.5, 'turn', 1, 6, 'lin'),
  f('revGuardFloor', 2, 'maneuver', 0.8, 5, 'lin'),
  f('revSweepFloor', 2, 'maneuver', 0.8, 5, 'lin'),
  f('routeLimitKappa', 0.04, 'turn', 0.005, 0.08, 'lin'),
  f('routeLimitLatScale', 1, 'turn', 0.7, 3, 'lin'),
  f('routeCurveWindow', 14, 'turn', 6, 25, 'lin'),
  b('routeLimitStops', false, 'turn'),
  f('routeLimitGearSwitch', 3, 'turn', 1.5, 8, 'lin'),
  b('routeClearance', true, 'route'),
  f('clearMin', 3, 'route', 0.5, 5, 'lin'),
  f('clearMax', 6, 'route', 2, 10, 'lin'),
  f('clearSpeedGain', 0.12, 'route', 0, 0.3, 'lin'),
  f('clearWeight', 0.03, 'route', 0, 0.1, 'lin'),
  f('clearMinSpeed', 9, 'trigger', 4, 20, 'lin'),
  f('clearMazeRun', 40, 'trigger', 10, 80, 'lin'),
  f('fieldInflate', 2.8, 'route', 1.6, 3.8, 'lin'),
  f('fieldBlockCost', 400, 'route', 50, 1000, 'log'),
  // M1 lists 1 (the car's saver:true value); the episodes run saver:false (baseline parity), where the stage default 0.3 is effective
  f('fieldEvery', 0.3, 'trigger', 0.2, 2, 'lin'),
  f('sensorRange', 150, 'perception', 40, 150, 'lin'),
  f('fwdFovDeg', 70, 'perception', 40, 120, 'lin'),
  f('ecoManConeDeg', 100, 'perception', 60, 160, 'lin'),
  f('fixConeDeg', 24, 'perception', 12, 45, 'lin'),
  f('memoryTtl', 15, 'perception', 5, 60, 'lin'),
  f('rearRange', 8, 'perception', 4, 15, 'lin'),
  f('aebDecel', 7, 'safety', 4, 20, 'lin'),
  f('aebMargin', 1, 'safety', 0.2, 2.5, 'lin'),
  f('aebHalfWidth', 1.9, 'safety', 0.9, 2.4, 'lin'),
  f('goalWatchdog', 10, 'trigger', 3, 40, 'lin'),
]

/** Append new genes here (e.g. params added to the AV stack later); keys must be unique. */
export const AV_GENES_EXTRA: GeneSpec[] = [
  // P1: motion-planner / maneuver / misc stage constants exposed as params (defaults identical to the stage code)
  f('turnAngle1', 0.5, 'turn', 0.2, 0.9, 'lin'),
  f('turnAngle2', 1.15, 'turn', 0.8, 1.55, 'lin'),
  f('sweepStep', 0.75, 'cpu', 0.4, 1.5, 'lin'),
  f('requiredExtra', 5, 'safety', 2, 12, 'lin'),
  f('maneuverRunDecel', 3, 'maneuver', 1.5, 10, 'lin'),
  f('maneuverRunOffset', 0.9, 'maneuver', 0, 3, 'lin'),
  i('revVotes', 2, 'maneuver', 1, 4, 'lin'),
  f('maneuverEntrySpeed', 1.5, 'maneuver', 0.5, 5, 'lin'),
  f('maneuverEntryStopSpeed', 0.3, 'maneuver', 0.1, 1.5, 'lin'),
  f('replanCooldown', 0.6, 'maneuver', 0.15, 2, 'log'),
  f('stuckSpeed', 0.25, 'trigger', 0.1, 1, 'lin'),
  f('routeLimitHorizon', 160, 'turn', 60, 300, 'lin'),
  f('nearHitExtra', 1.5, 'maneuver', 0, 4, 'lin'),
  f('revCruiseBehind', 0.3, 'maneuver', 0, 0.9, 'lin'),
  f('nearTouchDist', 0.3, 'speed', 0, 1.5, 'lin'),
  f('aebMinSpeed', 0.8, 'safety', 0.3, 3, 'lin'),
  f('aebManeuverMargin', 0.2, 'safety', 0.05, 0.8, 'lin'),
  f('ppMinSpeed', 3, 'turn', 1, 10, 'lin'),
  f('ppMinClearance', 1, 'turn', 0, 3, 'lin'),
  f('kappaTauFast', 0.04, 'turn', 0.01, 0.15, 'log'),
  f('kappaTauSpeed', 0.008, 'turn', 0, 0.02, 'lin'),
  f('iClamp', 3, 'speed', 1, 8, 'lin'),
  f('overspeedCut', 8, 'speed', 2, 20, 'lin'),
  // v3: maze-module genes (only act when the maze module is on; defaults identical to the stage code)
  f('mazeTurnCos', 0.5, 'maze', 0.2, 0.8),
  f('mazeWpMin', 12, 'maze', 6, 20),
  f('mazeArriveR', 4, 'maze', 2, 8),
  f('mazeOffRoute', 8, 'maze', 4, 14),
  i('mazeRays', 16, 'maze', 8, 32),
  // v4: maze-module activation (default off = the escape only starts on a trigger, which chaser-free maze episodes never give)
  b('mazeForce', false, 'maze'),
  // v5: maze escape toward the mission goal + stall-triggered fallback (all default off = identical behaviour)
  f('mazeGoalW', 0, 'maze', 0, 4),
  f('mazeStallT', 0, 'maze', 0, 20),
  f('mazeStallProg', 8, 'maze', 2, 20),
  f('mazeStallHold', 10, 'maze', 3, 30),
]

export const AV_GENOME_SPEC: GenomeSpec = { specVersion: AV_SPEC_VERSION, genes: [...AV_GENES_M1, ...AV_GENES_EXTRA] }

/**
 * Resume guard shared by the CLI (`--resume`) and the browser controller: a run saved under another gene spec version has
 * a different gene vector (engine state, population and elites are index-aligned to the spec), so resuming it would silently
 * mix gene sets. Returns an error message, or undefined when the run's spec version is the current one.
 */
export function avSpecResumeError(runSpecVersion: string): string | undefined {
  return runSpecVersion === AV_SPEC_VERSION
    ? undefined
    : `created with gene spec v${runSpecVersion}; the current spec is v${AV_SPEC_VERSION}. Start a new run (resuming would change the gene set).`
}

export function avDefaultParams(spec: GenomeSpec = AV_GENOME_SPEC): Params {
  return Object.fromEntries(spec.genes.map((g) => [g.key, g.default]))
}
