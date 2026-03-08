/**
 * CarTransformer2: input-to-color feedback. Maps WASD + handbrake actions
 * to RGB colors and blends them when multiple keys are pressed.
 * No physics output — display feedback only.
 */

import { BaseTransformer } from '../transformer'
import type { TransformInput, TransformOutput } from '@/types/transformer'
import type { Vec3 } from '@/types/world'
import { clamp } from '@/utils/numberUtils'
import { computeSteeringTorqueMagnitude, getForwardSpeed, scaleVec3 } from '@/utils/vec3'

const ACTION_COLORS: Record<string, [number, number, number]> = {
  throttle: [0.2, 0.9, 0.2],
  brake: [0.9, 0.2, 0.2],
  steer_left: [0.2, 0.2, 0.9],
  steer_right: [0.9, 0.2, 0.2],
  handbrake: [0.9, 0.2, 0.9],
}

const NEUTRAL_COLOR: [number, number, number] = [0.5, 0, 0.5]
const MAGNITUDE_THRESHOLD = 0.01

export class CarTransformer2 extends BaseTransformer {
  readonly type = 'car2'
  wheelAngle: number = 0; // -1 to 1
  
  
  
  transform(input: TransformInput, deltaTime: number): TransformOutput {
    this.calculateWheelAngle(input);

    const forwardVector= this.getForwardVector(input.rotation)
    const color = this.setColors(input)
    const impulse = this.setImpulse(input, deltaTime, forwardVector )
    const torque: Vec3 = this.setTorque(input, forwardVector)
    return {
      color,
      impulse,
      torque,
      earlyExit: false,
    }
  }

  private setTorque(input: TransformInput, forwardVector: Vec3): Vec3 {
    const speed = getForwardSpeed(input.velocity, forwardVector)
    const magnitude = computeSteeringTorqueMagnitude(speed, this.wheelAngle)
    const upVector = this.getUpVector(input.rotation)
    return scaleVec3(upVector, magnitude)
  }

  private setImpulse(input: TransformInput, _dt: number, forwardVector:Vec3): Vec3 {
    const forward = this.getAction(input, 'throttle');
    const backward = this.getAction(input, 'brake');
    const gasBreakInput = forward  - backward;
    const gasBreakForce = scaleVec3(forwardVector, 200 * gasBreakInput);
    const sideSpeed =  this.getSidewaysVelocity(input.velocity, forwardVector); //normalize velocity by only keeping sideWays force
    const sideForce = scaleVec3(sideSpeed, -100); // cap this at tire sliding force
    return this.addVec3(gasBreakForce, sideForce);
  }

  private getSidewaysVelocity(velocity: Vec3, forward: Vec3): Vec3 {
    const lenSq = forward[0]**2 + forward[1]**2 + forward[2]**2
    const invLen = lenSq > 1e-10 ? 1 / Math.sqrt(lenSq) : 0
    const fx = forward[0] * invLen
    const fy = forward[1] * invLen
    const fz = forward[2] * invLen
    const dot = velocity[0] * fx + velocity[1] * fy + velocity[2] * fz
    return [
      velocity[0] - dot * fx,
      velocity[1] - dot * fy,
      velocity[2] - dot * fz,
    ]
  }

  private setColors(input:TransformInput) :[number, number, number]{
    let color = computeActionColor(input.actions, ACTION_COLORS, NEUTRAL_COLOR, MAGNITUDE_THRESHOLD);
    color = brightenByWheelAngle(color, this.wheelAngle);
    return color;
  }







  private calculateWheelAngle(input:TransformInput){
    const factor = .01;
    const left = this.getAction(input, 'steer_left');
    const right = this.getAction(input, 'steer_right');

    //apply direction
    let force =  right - left;
    if(force === 0){
      //move to center
      if(this.wheelAngle > 0) force = -1;
      else if(this.wheelAngle < 0) force = 1;

    }
    this.wheelAngle +=  force * factor;
    this.wheelAngle = clamp(this.wheelAngle, -1, 1);


  }


}

/**
 * Blend colors from actions weighted by magnitude. When no actions exceed threshold, returns neutral.
 */
function computeActionColor(
  actions: Record<string, number>,
  colorMap: Record<string, [number, number, number]>,
  neutralColor: [number, number, number],
  magnitudeThreshold: number,
): [number, number, number] {
  let rSum = 0
  let gSum = 0
  let bSum = 0
  let totalMagnitude = 0

  for (const [action, color] of Object.entries(colorMap)) {
    const mag = Math.abs(actions[action] ?? 0)
    if (mag > magnitudeThreshold) {
      rSum += color[0] * mag
      gSum += color[1] * mag
      bSum += color[2] * mag
      totalMagnitude += mag
    }
  }

  if (totalMagnitude < magnitudeThreshold) {
    return [...neutralColor]
  }
  return [
    Math.max(0, Math.min(1, rSum / totalMagnitude)),
    Math.max(0, Math.min(1, gSum / totalMagnitude)),
    Math.max(0, Math.min(1, bSum / totalMagnitude)),
  ]
}

/**
 * Brighten color toward white based on wheel/steer angle (-1 to 1).
 * At angle 0, no change; at |angle| 1, brightens toward white.
 */
function brightenByWheelAngle(
  color: [number, number, number],
  wheelAngle: number,
): [number, number, number] {
  const amount = Math.min(1, Math.abs(wheelAngle))
  return [
    Math.min(1, color[0] + (1 - color[0]) * amount),
    Math.min(1, color[1] + (1 - color[1]) * amount),
    Math.min(1, color[2] + (1 - color[2]) * amount),
  ]
}
