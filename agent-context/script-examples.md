# Script Examples

Example scripts for common use cases. Attach to entities via the Scripts tab in the Builder.

---

## Make collision partners red

On collision, turn the other entity red. Skips entities named "Ground" (e.g. floor/terrain).

**Event:** `onCollision`  
**Attach to:** The entity that should react to collisions (e.g. the car)

```javascript
ctx.log("MAKE RED: " + ctx.other.name);

if (ctx.other.name === "Ground") return;
ctx.other.setColor(1, 0, 0);  // RGB 0–1
```

**Note:** `setColor(r, g, b)` expects values in 0–1, not 0–255. Red = `(1, 0, 0)`.
