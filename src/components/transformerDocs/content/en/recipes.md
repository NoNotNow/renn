---
keywords:
  - example
  - recipe
  - movement
  - visualize
  - actions
  - throttle
  - steer
  - car2
  - raycast
searchText: throttle steer car2 raycastSpread
---

#### Move with an action

```javascript
function transform(input, dt, params, state, api) {
  const forward = api.vec.getForwardVector(input.rotation);
  const power = api.getAction(input, 'forward') * 100;

  return {
    force: api.vec.scale(forward, power),
  };
}
```

The action name {{forward_action|:'forward'}} must match your {{input_preset|:input}} mapping.

#### Synthetic actions for car2

Write to {{actions|:input.actions}} and return `{}`. Place your {{custom_transformer|:custom}} stage **after** {{input_preset|:input}} and **before** {{car2|:car2}}. Use {{state|:state}} + {{dt|:dt}} for timers (not {{new_Date|:new Date()}}).

```javascript
function transform(input, dt, params, state, api) {
  state.t = (state.t ?? 0) + dt;

  if (state.t > 1 && state.t < 4) input.actions.throttle = 0.35;
  if (input.position[0] > 8) input.actions.steer_right = 1;
  else if (input.position[0] < -8) input.actions.steer_left = 1;

  return {};
}
```

#### Obstacle raycast

Uses offsetAlong and raycastSpread — same pattern as AutoBrake in the hunt example world.

```javascript
function transform(input, dt, params, state, api) {
  const forward = api.getForwardVector(input.rotation);
  const front = api.vec.offsetAlong(input.position, forward, 5);
  const hit = api.raycastSpread(front, forward, 20, 2, 5, { visualize: true });

  if (hit.hit && hit.distance < 3) {
    return { force: api.vec.scale(forward, -150) };
  }
  return {};
}
```

#### Visual debugging (Builder)

```javascript
function transform(input, dt, params, state, api) {
  const speed = api.vec.length(input.velocity);
  api.visualize(speed, '#00ff00', 'Speed', 1);
  api.visualizeLine(input.position, [0, 5, 0], 'red');
  return {};
}
```

<p class="doc-muted">api.visualize* works only in Builder with Visualize mode enabled.</p>
