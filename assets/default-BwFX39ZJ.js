const n=`{
  "type": "wanderer",
  "priority": 5,
  "enabled": true,
  "params": {
    "speed": 2,
    "jumpDistance": 3,
    "linear": true,
    "angular": true,
    "perimeter": {
      "center": [0, 0, 0],
      "halfExtents": [5, 5, 5]
    },
    "positionEpsilon": 0.05,
    "rotationEpsilon": 0.08
  }
}
`;export{n as default};
