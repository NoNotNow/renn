/**
 * CarTransformer: realistic arcade car physics using the bicycle model.
 *
 * Handles:
 * - Throttle / reverse / engine braking (longitudinal forces)
 * - Steering via turning radius derived from front-wheel angle (bicycle model)
 * - Lateral tire grip that keeps the car tracking its heading
 * - Handbrake: strong braking + reduced lateral grip for drifting
 * - Max speed tapering: engine force drops to zero near top speed
 *
 * All output is via TransformOutput.force and TransformOutput.torque only.
 * No impulses are used, consistent with the resetAllForces → apply → step pipeline.
 *
 * Bicycle model reference:
 *   turningRadius = wheelbase / tan(steerAngle)
 *   omega         = forwardSpeed / turningRadius
 * Lateral grip is modelled as a counter-force opposing sideways velocity.
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput } from '@/types/transformer'
import * as THREE from 'three'

export interface CarTransformerParams {
  /** Top speed in m/s. Engine force tapers to zero as speed approaches this. Default 25. */
  maxSpeed?: number
  /** Engine force magnitude (Newtons). Sized for mass ~12 by default. Default 200. */
  acceleration?: number
  /**
   * If set (seconds), the registry derives acceleration from entity mass and maxSpeed
   * so the car reaches max speed in this time. Overrides acceleration when present.
   */
  timeToMaxSpeed?: number
  /** Braking force magnitude when brake input is active and moving forward. Default 400. */
  brakeForce?: number
  /** Passive deceleration force when coasting (no throttle, no brake). Default 30. */
  engineBrake?: number
  /** Maximum front-wheel steering angle in radians. Default 0.5 (~28.6 deg). */
  maxSteerAngle?: number
  /** Distance between front and rear axle in world units. Match ~half entity depth. Default 2.0. */
  wheelbase?: number
  /**
   * Lateral grip force multiplier. Higher values = tighter cornering, less sliding.
   * Applied as force = -lateralSpeed * lateralGrip opposing sideways velocity. Default 25.
   */
  lateralGrip?: number
  /**
   * Fraction of lateral grip active during handbrake (0–1).
   * Lower = more slide/drift. Default 0.15.
   */
  handbrakeGripFactor?: number
  /** Handbrake braking force multiplier (applied on top of brakeForce). Default 3. */
  handbrakeMultiplier?: number
  /**
   * Scale applied to the computed omega torque to overcome angular damping.
   * Tune alongside the entity's angularDamping. Default 40.
   */
  steeringTorqueScale?: number
  /**
   * Minimum effective forward speed (m/s) used for steering when throttle+steer held
   * but car is nearly stationary. Ensures wheels turn immediately when accelerating.
   * Default 0 (steering only applies when car has actual speed).
   */
  minSteerSpeed?: number
  /**
   * Fraction of max steer angle applied at max speed (0–1).
   * Lower = softer steering at high speed. Default 0.35.
   */
  highSpeedSteerFactor?: number
  /**
   * Steer multiplier at rest (speed=0). Values > 1 boost low-speed turning.
   * Default 1.2. Use 1 for no boost.
   */
  lowSpeedSteerFactor?: number
}

const DEFAULT_PARAMS: Required<CarTransformerParams> = {
  maxSpeed: 25,
  acceleration: 200,
  timeToMaxSpeed: undefined!,
  brakeForce: 400,
  engineBrake: 30,
  maxSteerAngle: 0.5,
  wheelbase: 2.0,
  lateralGrip: 25,
  handbrakeGripFactor: 0.15,
  handbrakeMultiplier: 3,
  steeringTorqueScale: 40,
  minSteerSpeed: 0,
  highSpeedSteerFactor: 0.35,
  lowSpeedSteerFactor: 1.2,
}

/** Speed below which the car is considered stationary for reverse logic. */
const REVERSE_THRESHOLD = 0.5

export class CarTransformer extends BaseTransformer {
  readonly type = 'car'
  private params: Required<CarTransformerParams>
  /** Target front-wheel steer angle (radians). Updated each frame from steer input. */
  private targetSteerAngle = 0

  constructor(priority: number = 10, params: CarTransformerParams = {}) {
    super(priority, true)
    this.params = { ...DEFAULT_PARAMS, ...params }
  }

  setParams(params: Partial<CarTransformerParams>): void {
    this.params = { ...this.params, ...params }
  }

  transform(input: TransformInput, dt: number): TransformOutput {
    const {
      maxSpeed,
      acceleration,
      brakeForce,
      engineBrake,
      maxSteerAngle,
      wheelbase,
      lateralGrip,
      handbrakeGripFactor,
      handbrakeMultiplier,
      steeringTorqueScale,
      minSteerSpeed,
      highSpeedSteerFactor,
      lowSpeedSteerFactor,
    } = this.params

    // Actions
    const throttle = this.getAction(input, 'throttle')
    const brake = this.getAction(input, 'brake')
    const steerLeft = this.getAction(input, 'steer_left')
    const steerRight = this.getAction(input, 'steer_right')
    const handbrake = this.getAction(input, 'handbrake')

    // ── Orientation ──────────────────────────────────────────────────────────
    const [rx, ry, rz] = input.rotation
    const euler = new THREE.Euler(rx, ry, rz, 'XYZ')

    const forwardDir = new THREE.Vector3(0, 0, -1).applyEuler(euler)
    const rightDir = new THREE.Vector3(1, 0, 0).applyEuler(euler)

    // ── Local velocity decomposition ─────────────────────────────────────────
    const [vx, vy, vz] = input.velocity
    const velocity = new THREE.Vector3(vx, vy, vz)
    const speed = velocity.length()

    // Signed speed along the car's forward axis (+forward, -backward)
    const forwardSpeed = velocity.dot(forwardDir)
    // Signed speed along the car's right axis (+right, -left)
    const lateralSpeed = velocity.dot(rightDir)

    // ── Accumulated force and torque ─────────────────────────────────────────
    const totalForce = new THREE.Vector3()
    let steeringTorqueY = 0

    // ── 1. Longitudinal forces ───────────────────────────────────────────────

    if (handbrake > 0) {
      // Handbrake: strong braking, no engine
      if (speed > 0.05) {
        const handbrakeDecel = handbrakeMultiplier * brakeForce
        // Apply force opposing current velocity direction
        totalForce.addScaledVector(velocity.clone().normalize(), -handbrakeDecel)
      }
    } else if (throttle > 0) {
      // Engine force, tapering to zero near maxSpeed
      const speedRatio = Math.max(0, forwardSpeed / maxSpeed)
      const taper = Math.max(0, 1 - speedRatio)
      totalForce.addScaledVector(forwardDir, throttle * acceleration * taper)
    } else if (brake > 0) {
      if (forwardSpeed > REVERSE_THRESHOLD) {
        // Braking while moving forward
        totalForce.addScaledVector(forwardDir, -brake * brakeForce)
      } else if (forwardSpeed > -maxSpeed) {
        // Reverse: brake key held from standstill or while reversing
        const reverseSpeedRatio = Math.max(0, -forwardSpeed / maxSpeed)
        const taper = Math.max(0, 1 - reverseSpeedRatio)
        totalForce.addScaledVector(forwardDir, -brake * acceleration * taper)
      }
    } else if (speed > 0.1) {
      // Engine braking: coasting with no input
      totalForce.addScaledVector(velocity.clone().normalize(), -engineBrake)
    }

    // ── 2. Lateral grip ───────────────────────────────────────────────────────
    // Counter-force opposing sideways velocity simulates tire grip.
    const effectiveGrip = handbrake > 0
      ? lateralGrip * handbrakeGripFactor
      : lateralGrip
    totalForce.addScaledVector(rightDir, -lateralSpeed * effectiveGrip)

    // ── 3. Steering (bicycle model) ───────────────────────────────────────────
    const steerInput = steerRight - steerLeft
    // Update target wheel angle each frame regardless of speed
    this.targetSteerAngle =
      Math.abs(steerInput) > 0.001 ? steerInput * maxSteerAngle : 0

    if (Math.abs(this.targetSteerAngle) > 0.001) {
      // Softer at high speed, steeper at low: lerp from lowSpeedSteerFactor at rest to highSpeedSteerFactor at maxSpeed
      const speedRatio = Math.min(1, Math.abs(forwardSpeed) / maxSpeed)
      const steerMultiplier =
        lowSpeedSteerFactor - speedRatio * (lowSpeedSteerFactor - highSpeedSteerFactor)
      const steerAngle = this.targetSteerAngle * steerMultiplier
      const tanAngle = Math.tan(Math.abs(steerAngle))
      const turningRadius = wheelbase / Math.max(tanAngle, 0.001)
      // Use minSteerSpeed when throttle/brake+steer held but nearly stationary
      const effectiveSpeed =
        Math.abs(forwardSpeed) >= minSteerSpeed
          ? forwardSpeed
          : throttle > 0
            ? minSteerSpeed
            : brake > 0 && forwardSpeed <= REVERSE_THRESHOLD
              ? -minSteerSpeed
              : 0
      const omega = effectiveSpeed / turningRadius
      steeringTorqueY = Math.sign(steerAngle) * omega * steeringTorqueScale
    }

    // ── Compose output ────────────────────────────────────────────────────────
    const hasForce = totalForce.lengthSq() > 0.0001
    const hasTorque = Math.abs(steeringTorqueY) > 0.0001

    return {
      force: hasForce
        ? [totalForce.x, totalForce.y, totalForce.z]
        : undefined,
      torque: hasTorque
        ? [0, steeringTorqueY, 0]
        : undefined,
      earlyExit: false,
    }
  }
}
