# Transformer System Examples

## airplane-world.json

Vollständiges Beispiel-World mit:
- **Airplane Entity**: Spieler-gesteuertes Flugzeug mit InputTransformer + AirplaneTransformer
- **Butterfly Entity**: AI-gesteuerte Schmetterling mit ButterflyTransformer
- **Tree Entity**: Statisches Objekt (keine Transformers)
- **Wind**: Globaler Wind-Effekt

### Steuerung (Airplane)

- **W**: Thrust (vorwärts)
- **S**: Brake (rückwärts)
- **A**: Roll Left (links kippen)
- **D**: Roll Right (rechts kippen)
- **Trackpad horizontal**: Yaw (drehen)
- **Trackpad vertikal**: Pitch (nicken)
- **Space**: Boost

### Testen

1. Lade `airplane-world.json` im Builder
2. Wechsle in Play-Mode
3. Die Airplane-Entity sollte automatisch als Kamera-Target gesetzt werden
4. Steuere mit W/A/S/D und Trackpad-Gesten

### JSON-Struktur

```json
{
  "entities": [{
    "id": "airplane",
    "transformers": [
      {
        "type": "input",
        "priority": 0,
        "inputMapping": { ... }
      },
      {
        "type": "airplane",
        "priority": 1,
        "params": { ... }
      }
    ]
  }]
}
```

Die Pipeline: InputTransformer (priority 0) → AirplaneTransformer (priority 1) → Physics
