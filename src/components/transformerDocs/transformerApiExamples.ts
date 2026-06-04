import type { ApiDocRow } from './transformerApiReference'

/** Small usage snippets keyed by `ApiDocRow.name`. */
export const API_DOC_EXAMPLES: Record<string, string> = {
  transform: `function transform(input, dt, params, state, api) {
  state.t = (state.t ?? 0) + dt;
  return {};
}`,

  actions: `const throttle = api.getAction(input, 'throttle');
input.actions.steer_left = 1;`,

  position: `const [x, y, z] = input.position;
const ahead = api.vec.offsetAlong(input.position, forward, 2);`,

  rotation: `const forward = api.getForwardVector(input.rotation);
const up = api.getUpVector(input.rotation);`,

  velocity: `const speed = api.vec.length(input.velocity);
const fwdSpeed = api.vec.getForwardSpeed(input.velocity, forward);`,

  angularVelocity: `const spin = input.angularVelocity;
const turning = input.angularVelocity[1];`,

  accumulatedForce: `const push = input.accumulatedForce;
const total = api.vec.add(input.accumulatedForce, myForce);`,

  accumulatedTorque: `const twist = input.accumulatedTorque;`,

  environment: `if (input.environment.isTouchingObject) {
  const n = input.environment.groundNormal;
}`,

  deltaTime: `state.timer = (state.timer ?? 0) + input.deltaTime;`,

  entityId: `if (input.entityId === 'player') {
  return {};
}`,

  target: `if (input.target) {
  const goal = input.target.pose.position;
  const speed = input.target.speed;
}`,

  isGrounded: `if (input.environment.isGrounded) {
  return { force: [0, -10, 0] };
}`,

  groundNormal: `const up = input.environment.groundNormal ?? [0, 1, 0];
const flat = api.vec.projectOntoPlane(forward, up);`,

  isTouchingObject: `if (!input.environment.isTouchingObject) {
  return {};
}`,

  supportVelocity: `const rel = input.environment.supportVelocity
  ? api.vec.subtract(input.velocity, input.environment.supportVelocity)
  : input.velocity;`,

  wind: `const wind = input.environment.wind ?? [0, 0, 0];`,

  pose: `const pos = input.target.pose.position;
const rot = input.target.pose.rotation;`,

  speed: `const mps = input.target.speed;`,

  force: `return { force: api.vec.scale(forward, 200) };`,

  impulse: `return { impulse: [0, 120, 0] };`,

  torque: `return { torque: [0, 50, 0] };`,

  linvel: `return { linvel: [0, 0, 0] };`,

  addRotation: `return { addRotation: [0, 0.1, 0] };`,

  setPose: `return {
  setPose: { position: [0, 1, 0], rotation: [0, 0, 0] },
};`,

  color: `return { color: [1, 0.2, 0.2] };`,

  earlyExit: `return { earlyExit: true };`,

  add: `const sum = api.vec.add(a, b);`,

  subtract: `const delta = api.vec.subtract(target, input.position);`,

  scale: `const push = api.vec.scale(forward, power);`,

  length: `const dist = api.vec.length(delta);
const speed = api.vec.length(input.velocity);`,

  normalize: `const dir = api.vec.normalize(delta);`,

  dot: `const align = api.vec.dot(forward, dir);`,

  cross: `const right = api.vec.cross(forward, up);`,

  getForwardVector: `const forward = api.getForwardVector(input.rotation);`,

  getUpVector: `const up = api.getUpVector(input.rotation);`,

  getForwardSpeed: `const forward = api.getForwardVector(input.rotation);
const speed = api.vec.getForwardSpeed(input.velocity, forward);`,

  projectOntoPlane: `const up = api.getUpVector(input.rotation);
const flat = api.vec.projectOntoPlane(forward, up);`,

  rotateAroundAxis: `const turned = api.vec.rotateAroundAxis(dir, up, 0.5);`,

  offsetAlong: `const forward = api.getForwardVector(input.rotation);
const front = api.vec.offsetAlong(input.position, forward, 5);`,

  angleBetween: `const angle = api.vec.angleBetween(flatForward, toTarget);`,

  signedAngleAroundAxis: `const steer = api.vec.signedAngleAroundAxis(
  flatForward, toTarget, up,
);`,

  rightFromForward: `const right = api.vec.rightFromForward(forward, up);`,

  getAction: `const throttle = api.getAction(input, 'throttle');
const brake = api.getAction(input, 'brake');`,

  addVec3: `const sum = api.addVec3(a, b);`,

  subtractVec3: `const delta = api.subtractVec3(b, a);`,

  scaleVec3: `const scaled = api.scaleVec3(forward, 100);`,

  normalizeVec3: `const unit = api.normalizeVec3(dir);`,

  clamp: `const power = api.clamp(throttle - brake, -1, 1);`,

  eulerDeltaAroundAxis: `return {
  addRotation: api.eulerDeltaAroundAxis(input.rotation, [0, 1, 0], 0.2),
};`,

  raycast: `const forward = api.getForwardVector(input.rotation);
const hit = api.raycast(input.position, forward, 15, {
  visualize: true,
  hitColor: 'red',
});
if (hit.hit) api.log('Hit at ' + hit.distance);`,

  raycastSpread: `const forward = api.getForwardVector(input.rotation);
const front = api.vec.offsetAlong(input.position, forward, 5);
const hit = api.raycastSpread(front, forward, 20, 2, 5, {
  visualize: true,
});`,

  getWorldPosition: `const pos = api.getWorldPosition('enemy');
if (pos) {
  const toEnemy = api.vec.subtract(pos, input.position);
}`,

  getStartPosition: `const spawn = api.getStartPosition(input.entityId);`,

  getEntity: `const other = api.getEntity('crate');
const live = other?.getLivePosition();`,

  log: `api.log('Speed: ' + speed.toFixed(1), 3);`,

  visualize: `api.visualize(speed, '#00ff00', 'Speed', 1);`,

  visualizeLine: `api.visualizeLine(input.position, targetPos, '#ff4444');`,
}

export function attachApiExample(row: ApiDocRow): ApiDocRow {
  const example = API_DOC_EXAMPLES[row.name]
  if (example) return { ...row, example }
  if (row.callName) {
    return {
      ...row,
      example: `// ${row.callName}(...)`,
    }
  }
  return {
    ...row,
    example: `input.${row.name}`,
  }
}

export function attachExamplesToRows(rows: ApiDocRow[]): ApiDocRow[] {
  return rows.map(attachApiExample)
}
