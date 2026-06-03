#!/usr/bin/env node
/**
 * One-off: migrate hunt world custom transformers off local multiRaycast to api.raycastSpread.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const worldPath = path.join(__dirname, '../public/exampleWorlds/hunt/world.json')

const DIRECTION_CODE = `
var driveAway = {
  isOn: function () { return this.lastTriggerDate + 300 > Date.now(); },
  trigger: function () { this.lastTriggerDate = Date.now(); },
  lastTriggerDate: new Date(0)
}

var backOff = {
  isOn: function () { return this.lastTriggerDate + BACKOFF_MS > Date.now(); },
  trigger: function (direction) { this.lastTriggerDate = Date.now(); this.direction = direction },
  lastTriggerDate: new Date(0),
  direction: 0
}

function transform(
  /** @type {TransformInput} */ input,
  /** @type {number} */ dt,
  /** @type {Record<string, unknown>} */ params,
  /** @type {Record<string, unknown>} */ state,
  /** @type {TransformerRuntimeApi} */ api,
) {
  if (api.getAction(input, 'steer_left') || api.getAction(input, 'steer_right' || api.getAction(input, 'throttle') || api.getAction(input, 'brake'))) return;

  let forward = api.getForwardVector(input.rotation);
  let targetPos = input.target.pose.position;
  let inputToTarget = api.vec.subtract(targetPos, input.position);
  const distance = api.vec.length(inputToTarget);

  const up = api.getUpVector(input.rotation);
  forward = api.vec.normalize(api.vec.projectOntoPlane(forward, up));
  inputToTarget = api.vec.normalize(api.vec.projectOntoPlane(inputToTarget, up));

  const angle = api.vec.angleBetween(forward, inputToTarget);
  const signedSteer = api.vec.signedAngleAroundAxis(forward, inputToTarget, up);
  if (Math.abs(signedSteer) >= 0.001) {
    input.actions.steering_angle = signedSteer;
  }

  const maxSpeed = 120;
  const approachspeed = 3;
  const approachDist = 10;
  const turnSpeed = 20;
  let targetSpeed = 80;

  if (distance < approachDist) targetSpeed = approachspeed;
  if (Math.abs(angle) > 1) targetSpeed = turnSpeed;
  if (targetSpeed > maxSpeed) targetSpeed = maxSpeed;

  let currentSpeed = api.vec.length(input.velocity);

  if (backOff.isOn()) {
    input.actions.brake = 0.5;
    input.actions.throttle = 0;
    input.actions.steering_angle = -backOff.direction*5;
    return;
  } else {
    const front = api.vec.offsetAlong(input.position, forward, 5);
    if (api.raycastSpread(front, forward, 1, 2, 10).hit === true) {
      let direction = -input.actions.steering_angle;
      backOff.trigger(direction*5);
      api.log("BACKOFF " + direction);
    }
  }
  if (targetSpeed > currentSpeed) input.actions.throttle = 1;
}
`.trim()

const AUTO_BRAKE_CODE = `/** @returns {TransformOutput | undefined} */
function transform(
  /** @type {TransformInput} */ input,
  /** @type {number} */ dt,
  /** @type {Record<string, unknown>} */ params,
  /** @type {Record<string, unknown>} */ state,
  /** @type {TransformerRuntimeApi} */ api,
) {
  let forward = api.getForwardVector(input.rotation);
  let backward = api.vec.scale(forward, -1);
  let speed = api.vec.getForwardSpeed(input.velocity, forward);
  let frontPosition = api.vec.offsetAlong(input.position, forward, 5);
  let backdPosition = api.vec.offsetAlong(input.position, backward, 5);
  if (speed > 0) {
    let castResult = api.raycastSpread(frontPosition, forward, speed * speed / 300, 2, 8, { visualize: true });
    if (castResult.hit === true) {
      if (speed > 0.1) {
        let breakSpeed = 1 / (castResult.distance + 1) * ((speed * speed) / 200);
        if (breakSpeed > 1) breakSpeed = 1;
        input.actions.brake = breakSpeed;
        input.actions.throttle = 0;
      }
    }
  } else {
    let castResult = api.raycastSpread(backdPosition, backward, speed * speed / 300, 2, 8, { visualize: true });
    if (castResult.hit === true) {
      if (speed < -0.1) {
        let breakSpeed = 1 / (castResult.distance + 1) * ((speed * speed) / 200);
        if (breakSpeed > 1) breakSpeed = 1;
        input.actions.brake = 0;
        input.actions.throttle = breakSpeed;
      }
    }
  }
  return {};
}`

const MULTI_RAYCAST_FN =
  /\/\*\* @return \{RaycastResult \| undefined\} \*\/\s*function multiRaycast\([\s\S]*?\n\}\s*\n*/g

function backoffMsFromCode(code) {
  const block = code.match(/var backOff = \{[\s\S]*?\n\}/)
  const m = block?.[0]?.match(/lastTriggerDate \+ (\d+) > Date\.now\(\)/)
  return m ? m[1] : '700'
}

function stripMultiRaycast(code) {
  return code.replace(MULTI_RAYCAST_FN, '').replace(/multiRaycast\s*\(\s*api\s*,\s*/g, 'api.raycastSpread(')
}

function migrateUmlenker(code) {
  let c = stripMultiRaycast(code)
  c = c.replace(
    /let frontPosition = api\.vec\.add\(input\.position, api\.vec\.scale\(forward, 5\)\);/g,
    'let frontPosition = api.vec.offsetAlong(input.position, forward, 5);',
  )
  c = c.replace(
    /multiRaycast\(api, frontPosition, forward,/g,
    'api.raycastSpread(frontPosition, forward,',
  )
  return c
}

function visitTransformers(obj, fn) {
  if (!obj || typeof obj !== 'object') return
  if (obj.type === 'custom' && typeof obj.code === 'string') {
    fn(obj)
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === 'object') visitTransformers(v, fn)
  }
}

const world = JSON.parse(fs.readFileSync(worldPath, 'utf8'))
let count = 0

visitTransformers(world, (t) => {
  if (t.name === 'direction' && t.code.includes('multiRaycast')) {
    const ms = backoffMsFromCode(t.code)
    t.code = DIRECTION_CODE.replace('BACKOFF_MS', ms)
    count++
  } else if (t.name === 'AutoBrake' && t.code.includes('multiRaycast')) {
    t.code = AUTO_BRAKE_CODE
    count++
  } else if (t.code.includes('function multiRaycast')) {
    t.code = migrateUmlenker(t.code)
    count++
  }
})

if (world.transformers?.car_tf4) world.transformers.car_tf4.code = world.transformers.car_tf4.name === 'direction'
  ? DIRECTION_CODE.replace('BACKOFF_MS', backoffMsFromCode(world.transformers.car_tf4.code))
  : world.transformers.car_tf4.code
if (world.transformers?.car_tf1_copy?.name === 'AutoBrake') {
  world.transformers.car_tf1_copy.code = AUTO_BRAKE_CODE
}

fs.writeFileSync(worldPath, JSON.stringify(world, null, 2) + '\n')
console.log(`Migrated ${count} transformer code blocks in ${worldPath}`)
