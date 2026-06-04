---
keywords:
  - example
  - recipe
  - beispiel
  - movement
  - visualize
  - actions
  - throttle
  - steer
  - car2
  - raycast
searchText: throttle steer car2 raycastSpread
---

#### Bewegen mit einer Steuerung

```javascript
function transform(input, dt, params, state, api) {
  const forward = api.vec.getForwardVector(input.rotation);
  const power = api.getAction(input, 'forward') * 100;

  return {
    force: api.vec.scale(forward, power),
  };
}
```

Der Name {{forward_action|:'forward'}} muss in deiner {{input_preset|:input}}-Tastenbelegung genau so heißen.

#### Steuerwerte für car2 setzen

Schreibe Werte in {{actions|:input.actions}} und gib `{}` zurück. Dein {{custom_transformer|:custom}}-Transformer sollte **nach** {{input_preset|:input}} und **vor** {{car2|:car2}} laufen. Für Timer: {{state|:state}} + {{dt|:dt}} (nicht {{new_Date|:new Date()}} — das ist echte Uhrzeit).

```javascript
function transform(input, dt, params, state, api) {
  state.t = (state.t ?? 0) + dt;

  if (state.t > 1 && state.t < 4) input.actions.throttle = 0.35;
  if (input.position[0] > 8) input.actions.steer_right = 1;
  else if (input.position[0] < -8) input.actions.steer_left = 1;

  return {};
}
```

#### Hindernis mit Strahlmessung

Nutzt offsetAlong und raycastSpread — wie beim AutoBremsen in der Hunt-Beispielwelt.

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

#### Werte im Builder anzeigen

```javascript
function transform(input, dt, params, state, api) {
  const speed = api.vec.length(input.velocity);
  api.visualize(speed, '#00ff00', 'Speed', 1);
  api.visualizeLine(input.position, [0, 5, 0], 'red');
  return {};
}
```

<p class="doc-muted">api.visualize* funktioniert nur im Builder, wenn der Visualize-Modus an ist.</p>
