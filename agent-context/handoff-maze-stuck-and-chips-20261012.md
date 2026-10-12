# Handoff: Candidate-Chips live + 8h-Trainingslauf v3mg7 beendet + Maze-Stuck-Diagnose (2026-10-12, Morgen)

Für den nächsten Agenten. Drei Dinge sind passiert: (1) das Candidate-Switcher-Feature aus
`handoff-maze-dialog-candidates-20261011.md` ist gebaut und deployed, (2) der 8-Stunden-Trainingslauf ist
durchgelaufen und sauber beendet, (3) Manuel fragt jetzt gezielt nach dem Maze-Stuck — die Diagnose unten
fasst zusammen, was er weiß und welche Hebel er erwägt.

## 1) Feature: Candidate-Chips im Training-Mazes-Dialog (commit 41b66d4b, deployed)

- **Architektur (bewusst simpel, nach Manuels „kann das einfacher sein?"):** Die 698 Gewichte liegen in
  world.json als `params.w` der Drive-Stage (der Stage-Code ist generisch). Kandidatenwechsel = reines
  `params.w`-Swap auf dem geladenen Klon — `applyMazeCandidate` (`src/policyEvolution/mazeCandidates.ts`),
  exakt das `focusMazeRoute`-Muster. On-Disk-Gate unberührt (nur mit gepinntem
  `RENN_V3_GENOME_FILE=<abs>/training-data/policy-evolution/.trial-snapshot.json` grün; bare = rot solange
  ein Trial-Kandidat deployed ist — bekannt, kein Defekt).
- **Export:** `tools/policy-evolution/export-maze-candidates.ts` schreibt
  `public/policy-evolution/candidates.json` (I1/I2/I3 = Inselzentren mit age/origin/stagn-Tooltip, Best,
  Shipped — shipped 650→698 via `ensureV3Inputs`). Der auto-trial-Watcher refresht die Datei jeden Zyklus
  und trial-deployt neue Bests. Serverseitig kein State: fetch + in-memory Swap.
- **Dialog/Builder:** Chips in der Headerleiste (auch kollabiert), aktiver Chip akzentuiert, Klick auf
  aktiven Chip = zurück zum deployten Kandidat, Persistenz `mazeTrainingPanelCandidate` (localStorage),
  Chip-Klick bei laufendem Run lädt Welt+Route sofort mit dem neuen Modell. Chips fehlen still, wenn
  candidates.json fehlt (älteres Deploy). UI-Text erklärt: die Punktzahlen im Dialog gehören zum DEPLOYTEN
  Kandidaten.
- **Gates:** Dialog-Tests 17/17, mazeCandidates 3/3, policyEvolution grün, tsc/eslint clean. Full-Suite
  hatte 21 rote — ALLE am HEAD-Worktree als pre-existing verifiziert (10x maze-training-worlds bare-env,
  11x AV/flee-WIP, in handoff-flee-improvements.md dokumentiert).

## 2) Der 8h-Lauf (22:21–06:33, gen 1228 → 5604, sauber gestoppt)

- Commits: 0aed38ec → fe83a278 → 14411bfa → 2d0327fd → 1e38bc49 → 751b3141 → cc413e20 → e15c3701 →
  FINAL cbab3dc7 (alle gepusht). Cron-Checkpoint-Loop alle 45 min (committen, pushen, deployen, resumen) —
  Muster steht, bei Bedarf wiederholbar.
- **Best UNVERÄNDERT: gen 925** (train/holdout 0.000, Insel 1). Blockiert am Leximin-Schwanz: worst3
  bleibt 0.000 — die 3 schlechtesten Episoden sind konsistent dieselben Stuck-Routen. Skalar-Fortschritt
  zeigt sich nur in den finished-Zahlen (train/holdout-Skalare 0.000 = speedCap-Währung + worst3, NICHT
  als Regression lesen).
- Epoch-Plateau: HOLDOUT 96/125 (Start) → Maximum 121/125 (gen 3350 + 4250) → seither stabil 118–121/125.
- **Jede der 3 Inseln wurde in der Nacht genau einmal reinitialisiert** (I0 ~gen 2375, I2 ~3850,
  I1 ~4750). Auffällig: die längste Holdout-Bestmarke (121/125) kam von I0 — der frisch reinitialisierten
  Insel. Der Stagnations-Reset kennt kein „behalte eine gelöste Route".
- Verluste am Ende: kaum noch Crashes; Rest = Offcourse in maze (10–12/13) und free (17–18/20).
- Watcher/Caffeinate mit dem Stop sauber beendet. Kein Ship ausgeführt (Manuels OK-Regel); Ship auf
  file.best (gen 925) wäre Wiederholung des alten Standes — nicht empfohlen.

## 3) Manuels Maze-Fragen (früh morgens) — Faktenlage für die Diskussion

Seine Fragen: warum klemmt das Maze, obwohl Inseln es zeitweise konnten; sind Position/Größe im Input;
wird Touch bestraft oder resettet; warum kommt das Auto nicht auf die Idee, bei Berührung rückwärts zu fahren; was ist die Karotte.

- **26 Inputs, alle relativ:** 14 Raycasts (±180°, 50 m), fwd/side-speed + Gierrate, Karotte
  (fwd/left/dist), letzter steer+gas, 2 Touch-Bits. **Keine absolute Position** — die Wagengröße steckt nur
  in Ray-/Physik-Geometrie.
- **Touch: bestraft, nicht resettet** — Episode läuft weiter; Fitness-Strafe pro Sekunde (Wand −12,
  Objekt −4 Pkt/s in der Score-Stage). Touch-Bits sagen dem Netz nur DASS es berührt, nicht WOHIN die Flucht liegt.
- **Karotte** = Zielpunkt ~8 m voraus auf der Führungskette (lila Linie in den Welten); die Kette ist der
  Lösungsweg. Der Wagen sieht nie das Ziel, nur „nächster Wegpunkt da vorne".
- **Warum keine Rückwärts-Idee bei Touch:** mechanisch möglich (VR = 8 m/s, Reverse-Legs werden gefahren
  — reverseShare je Art 2–80 %), aber bei Wandberührung zeigt die Karotte weiter VORWÄRTS: Rückwärts =
  Progress-Verlust + weg vom stärksten Signal; die Touch-Strafe ist schwächer als der versprochene
  Vorwärts-Progress. Dazu perzeptuelles Aliasing: gleiche Korridore = gleiche Ray-Muster, ohne
  Positionssignal nicht unterscheidbar; die worst3-Stuck-Routen sitzen genau an solchen Abzweigungen.

**Hebel, die Manuel jetzt auf dem Tisch hat** (noch NICHT gebaut, nichts entschieden):
1. **Position-/Fortschrittssignal als 27. Input** (z. B. Ketten-Bogenlänge oder Karotten-Änderungsrate) —
   killt das Aliasing direkt. Eingriff in Input-Layout = neue Genome-Form (v3 → v4) oder Zero-Pad-
   Migration, ship.ts/Beats-Best-Semantik beachten.
2. **Reinit-Regel schonen:** statt Random-Reset eine Teilkopie vom Insel-Best (eine gelöste Route soll
   nicht gewischt werden). Lag in islands.ts (`sigmaBoost`/FOCUS-Maschinerie; v3mg6-Postmortem nannte
   „4x boost destroyed the centers" als verwandtes Problem).
3. **Escape-Impuls bei Touch:** Karotte temporär spiegeln oder Touch-Strafe mit Richtungssignal koppeln,
   damit „rückwärts raus" im Gradienten sichtbar wird.

## Offene Fragen an Manuel

- Welchen der drei Hebel zuerst (Positionssignal ist der tiefste Eingriff, Reinit-Schonung der billigste)?
- Soll ein Inselzentrum (Chip I1/I2/I3) als Trial-Kandidat ernsthaft geprüft werden? Achtung: ship.ts
  bewertet nur file.best — dafür müsste der Kandidat erst als latest-best exportiert werden
  (RENN_V3_GENOME_FILE-Weg). Chips auf der Live-Site zeigen nur das Fahren, kein Gate-Urteil.

## Standing rules (unverändert)

Antwort an Manuel auf Deutsch. Keine Kriterien/Gates/Oracles lockern. Full vitest + `npx tsc --noEmit -p
tsconfig.app.json` + eslint auf geänderten Dateien vor jedem Deploy; Deploy nach jedem user-sichtbaren
Schritt; Ship braucht Manuel's OK. Branch: `claude/autonomous-car-evolution-9p6zt2` (main ist hinterher).
`AGENTS.md` + `src/components/workspace/TransformerPipelineHorizontal.tsx` haben uncommittete
Fremd-Änderungen — nicht committen, NIE stash. v3mg7.json regelmäßig committen. Zeitstempel in
latest-stats/train-ctl sind UTC (lokal UTC+2).
