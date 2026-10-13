# Handoff: policy evolution — die 3 offenen Punkte (Stand 2026-10-13)

Vorgänger-Lektüre (in dieser Reihenfolge): `agent-context/handoff-policy-evolution.md` → `agent-context/feature-policy-evolution.md` (Abschnitt „v3 crux curriculum, 2nd generation").
Branch `claude/autonomous-car-evolution-9p6zt2` (HEAD `e6b8c5c7`, alles gepusht + deployed). Regel wie immer: nach jedem abgeschlossenen, sichtbaren Schritt testen, committen, pushen, `npm run deploy`, dem User sagen, wo er hinschauen soll.

## Kontext in einem Absatz

Der Mitte-Anker des v3-Kommandos war die Wurzel des Kurven-Problems; er ist auf die **führende Kante** umgebaut (Schnauze vorwärts / Heck rückwärts, Hysterese ±0.5 m/s, v1/v2 bit-identisch). Der frische Maze-Run (`v3nose`, 3000 Gen) scheiterte am Ship-Gate (Best: 8/13 Holdout vs. Shipped 13/13). Seine Fail-Analyse (diagnose-v3, `training-data/policy-evolution/v3nose-diagnosis.json`) erzeugte die **2. Crux-Generation** (Klassen NC1 Tempo-Kurve, NC2 Start-Schwung; 15 Train + 10 Holdout Setups, 130 Ketten, Noise über jitterte Zielvektoren). Der Crux-Run `v3cruxnose` (nur crux, kalt, 3000 Gen) endete mit **67/76 Train (88 %) / 49/54 Holdout (91 %)** — Bedingung „alle bestanden" NICHT erfüllt, Maze-Run daher korrekt NICHT gestartet. Die Band ist als 25 spielbare Welten im Dialog („Training Crux", gleiche Maschinerie wie „Training Mazes"); das Welt-Scoring ist repariert (Bonus zahlt Ketten-Fortschritt statt Rohtempo, Score kontinuierlich statt floor).

## Wichtig: Staging-Disziplin

Im Working Tree liegen FÄLSCHLICHERWEISE dauerhaft fremde Änderungen: `AGENTS.md`, `src/components/workspace/TransformerPipelineHorizontal.tsx`, `.idea/`, `scratch/` — **nie mitstagen**. Nur explizite Pfade adden.

## Punkt 1 — Crux-Run auf 6000 verlängern (wartet auf User-Entscheidung, dann sofort ausführbar)

- Run ist gestoppt bei gen 3000/3000 (`training-data/policy-evolution/v3cruxnose.json`, checkpointed in `d78930fe`). Der Bester steht auf **gen 3000 selbst** — der Run war mitten im Fortschritt (Fokus-Insel 0, Epoche 2/4). Verlängerung ist vielversprechend.
- **So:** in `tools/policy-evolution/train-ctl.mjs` `TRAIN.targetGen` 3000 → 6000 UND im `TRAIN.start`-Kommando `run-v3.sh 3000 9` → `6000 9` ändern; why-Text ergänzen („extension to 6000 — best was still moving at gen 3000"). Dann `node tools/policy-evolution/train-ctl.mjs start` (resumt ab gen 3000; der auto-trial-Watcher startet mit und deployed alle 2 min den neuesten Besten in BEIDE Welten-Sets + aktualisiert die Kandidaten-Chips).
- Committen + pushen. Überwachung: stündlicher Check per `node tools/policy-evolution/train-ctl.mjs status` (kein Cron läuft gerade — bei Bedarf neu anlegen; Fall „abgestürzt vor dem Ziel": nur Log ansehen (`v3cruxnose.log`/`.nohup.log`) und melden, NICHT blind neu starten).
- **Bekannte Restfehler der 14 Fails** (aus `v3cruxnose-diagnosis.json`, Bester gen 3000): 11× Kurven-Crash mit Resttempo null (bremst, rutscht aber noch an die Wand; Setups crux:9/12/13/16, 1003~1, 1008~1) und 3× Vollgas-Offcourse in der ersten Sekunde (27+ m/s; Setup 1007~1, Ketten #0/#1/#5). Falls die Verlängerung genau daran nicht vorbeikommt: Kandidaten-Hebel sind (a) härtere/versetzte Bremsanforderung in NC1 (Anlauflänge/Occluder) oder (b) die 3 Ausreißer-Ketten als eigene Embodiment-Variante.

## Punkt 2 — danach: Warm-Start auf die großen Mazes (Bedingung: Crux 100 %)

- **Nur starten, wenn Punkt 1 endet mit 130/130** (76 Train + 54 Holdout). Prüfung des Besten:
  1. `python3 -c "import json; d=json.load(open('training-data/policy-evolution/v3cruxnose.json')); json.dump({'genome': d['best']['genome']}, open('training-data/policy-evolution/v3cruxnose-best.json','w')); print('gen', d['best']['gen'])"`
  2. `npx tsx tools/policy-evolution/diagnose-v3.ts --kinds crux --policy training-data/policy-evolution/v3cruxnose-best.json --train-per-kind 15 --holdout-per-kind 10 --list` → Kopfzeilen „train: 76 chains, finished N" / „holdout: 54 chains, finished N".
- **Bei 76/76 und 54/54:** Checkpoint-Commit der v3cruxnose-Artefakte + ggf. trial-deployte Welten (nur die bekannten Pfade: `training-data/policy-evolution/v3cruxnose*.json`, `latest-best.json`, `latest-stats.json`, `public/exampleWorlds/maze_train_*` + `crux_*`, `public/policy-evolution/candidates.json`), push, deploy.
- Dann `train-ctl.mjs` auf den Maze-Refinement-Run umstellen (Muster: der alte v3ref-Eintrag im Git-Verlauf): `TRAIN` state/log/nohupLog → `training-data/policy-evolution/v3cruxmaze.{json,log,nohup.log}`, why-Text (warm start vom v3cruxnose-Besten, Gen nennen), `V3_EXTRA_ARGS="--kinds maze --batch 6 --speed-cap 10 --warm training-data/policy-evolution/v3cruxnose.json"`, `ship()` auf `v3cruxmaze.json` + `--kinds maze`, ALLE v3cruxnose-Referenzen in den Regex-Zeilen (`rel`/`trainProcs`) und der Status-Meldung auf v3cruxmaze umschreiben. `start` ausführen, Status verifizieren (TRAINING + AUTO-TRIAL RUNNING), train-ctl-Änderung committen + pushen.
- **Nicht 130/130:** Maze-Run NICHT starten; Zahlen + Endgründe (`--list`) an den User, Optionen anbieten (weiter verlängern / Band nachschärfen).
- Nach Maze-Ende wie gehabt: `node tools/policy-evolution/train-ctl.mjs ship` (Ship-Gate, HOLDOUT finish-count vs. Shipped; `shippedPolicyV3.json` nur bei BESTEHEN ersetzt).

## Punkt 3 — optional: volle Präzision in `meta.bestScore`

- Heute: der Exporteur parst den Watch-String (`state.best.toFixed(1)`, z. B. „151.8 pts") → `meta.bestScore`/Kachel-Scores haben max. 0,1-Punkt-Auflösung. Intern (Stage `state.best`, Spiegel-Scorer `identicalScorer` in `tools/renn-mcp/trainingScoreRun.ts`) ist alles kontinuierlich.
- **Aber Achtung — der Grund, warum heute der Watch gewinnt:** die Stage rechnet Touch-Penalties mit (12 Pkt/s Wand, 4 Pkt/s Objekt), der Spiegel-Scorer kennt sie NICHT. Einfach den Scorer-Wert schreiben würde bei Autos, die beim Finish gerade kratzen, zu hohe Scores messen. Wer umstellt, muss die Penalty-Terme im Scorer nachbauen ODER die Abweichung bewusst dokumentieren.
- **So:** Penalty-Termine in `identicalScorer` nachbauen (Touch-Flags brauchen dafür den Sim-Zustand pro Auto — im `sim.runFrames`-Loop der `scoreTrainingWorld` verfügbar), dann den kontinuierlichen Scorer-Wert statt des Watch-Parses in `snapshot[i]` schreiben; Watch bleibt die Anzeige.
- Danach: `node tools/policy-evolution/train-ctl.mjs trial` (beide Sets neu exportieren, beide Gates laufen mit), Goldens in `maze-training-worlds.test.ts` / `crux-training-worlds.test.ts` prüfen (scoreOf-Parses sind bereits float-fähig, `/([\d.]+)/`).
- Empfehlung aus der letzten Runde: 0,1-Punkt-Auflösung reicht für Kandidaten-Tiebreaks — Punkt 3 ist Nice-to-have. Erst anpacken, wenn 1/2 durch sind.

## Schnellreferenz

- Status: `npm run train` (oder `node tools/policy-evolution/train-ctl.mjs status`), Stop nach Gen-Grenze: `… stop`, Trial-Deploy beider Sets + beide Gates: `… trial`.
- Known-broken (nicht von uns, nicht fixen): 11 vorbestehende HEAD-Test-Fails (avStackParams, eval ×2, av-evasion-sweep.1/.3, av-maze-params-exposed, av-maze-scenarios ×3 + .eco ×2) UND der Plain-Run-Artefakt der beiden Welt-Tests solange ein Trial-Kandidat deployed ist (kandidaten-bewusst laufen lassen: `RENN_V3_GENOME_FILE=<ABSOLUTER Pfad>/training-data/policy-evolution/.trial-snapshot.json npx vitest run …` — der Pfad MUSS absolut sein, sonst schlägt der source-Vergleich fehl).
- Scoring-Semantik der spielbaren Welten (seit `56693751`/`e6b8c5c7`): 1 Pkt/m gutgeschriebener Ketten-Fortschritt (Schnauze, LOS-gekappt) + Ketten-Bonus (Δs/dt, vRef-Deckel) − Touch-Penalties; kontinuierlicher High-Water; Anzeige 1 Dezimal. Die Trainings-Fitness (es.ts) ist davon UNBERÜHRT.
