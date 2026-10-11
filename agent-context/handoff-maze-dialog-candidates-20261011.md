# Handoff: Training-Mazes-Dialog — die anderen Kandidaten ladbar machen (2026-10-11, Abend)

Für den nächsten Agenten. Manuel will im Training-Mazes-Dialog die **anderen Kandidaten** ansehen können — nicht nur den
exportierten Best: die **3 Insel-Zentren** des laufenden Trainings (und idealerweise Best/Shipped als Vergleich).
In der **Headerleiste** des Dialogs sollen UI-Elemente („Chips") das jeweilige Modell laden. This is Manuel's idea and
his words: „in der headerleiste kann man dafür ui anbringen, die das jeweilige model lädt".

## Kontext in einem Satz

Das Training (v3mg7, `training-data/policy-evolution/v3mg7.json`) hat **3 Inseln** — jede ihr eigenes Zentrum
(`state.islands[k].es.theta`, je 698 Gewichte, Genome = `{genome: number[]}`-Shape wird überall akzeptiert) — plus den
exportierten Best (`training-data/policy-evolution/latest-best.json`, genauer `best.genome`) und das ausgelieferte
`shippedPolicyV3.json` (gen 1000). Derzeit sieht man in den Trainingswelten NUR den per Auto-Trial deployten Best.

## Die zentrale architektonische Frage (zuerst entscheiden)

Die Trainingswelten (`public/exampleWorlds/maze_train_1..5/world.json`) haben das Netz **zur Exportzeit eingebacken**
(Drive-Stage = generierter Stage-Code mit den Gewichten; Export via
`RENN_V3_GENOME_FILE=<file> npx tsx tools/renn-mcp/export-maze-training-worlds.ts --score`).
Der Browser kann nicht neu exportieren. Zwei Wege:

- **(a) Runtime-Override (empfohlen zu prüfen):** ein kleines Export-Tool (erweitert `auto-trial.mjs` oder ein neuer
  `npm run`-Schritt) schreibt zusätzlich `training-data/policy-evolution/candidates.json` (öffentlich servierbar):
  `{ islands: [{theta, age, origin, stagn, lastCenter} x3], best: {genome, gen}, shipped: {genome, gen}, gen, updatedAt }`.
  Der Dialog lädt diese Datei, zeigt Chips („I1 666", „I2 666", „I3 50", „Best gen N", „Shipped 1000"), und beim Laden
  der Welt wird das Genome des gewählten Kandidaten **im Builder in-memory** in die Drive-Stage-Parameter getauscht.
  Erst prüfen (und im Handoff-Ergebnis dokumentieren): wie genau liegt das Genome in `world.json`
  (`src/policyEvolution/mazeTraining.ts` — `MAZE_SCORE_STAGE_BASE`, Drive-Stage-Bau; `policyStageCode`), und gibt es
  eine Stelle im Builder-Load-Pfad, an der man Params pro Transformer übersetzen kann, ohne die Datei anzufassen?
- **(b) Dev-Export-Brücke:** Dialog ruft (nur im Dev-Server) einen Endpoint, der
  `tools/policy-evolution/train-ctl.mjs trial <candidates-snapshot>` triggert (siehe `trial()` in train-ctl.mjs:
  pinnt nach `.trial-snapshot.json`, exportiert, läuft den On-Disk-Gate). Finger weg von der Live-Site — nur dev.
  Aufwändiger und kollidiert mit auto-trial (s. u.) — nur falls (a) technisch nicht sauber geht.

## Harte Randbedingungen (nie verletzen)

- **On-Disk-Gate niemals rot machen:** `maze-training-worlds.test.ts` prüft „on disk == exporter output" UND
  meta.json-konsistent. Ein Runtime-Override darf `world.json`/`meta.json` NICHT anfassen — nur die geladene Instanz.
- **auto-trial Watcher** deployt alle 2 min den neuesten Best in die Welten (solange das Training läuft; nur bei
  neuem Best). Ein Runtime-Override überlebt das in der geladenen Szene, aber nach einem Reload ist der Best wieder
  drin — die Kandidaten-Wahl muss persistieren (localStorage +/oder URL-Param wie `?mazeCandidate=island-1`,
  analog zu den bestehenden Panel-Storage-Keys im Dialog).
- Die Zahlen im Dialog (`Best:`, `Worst:`, `Σ Best/Σ Worst`, Tile-Scores) beschreiben **den eingebackenen
  Kandidaten** (meta.json `candidate: {policy, label, gen, source}`), nicht den geladenen Override. Das muss die UI
  klar machen: aktiver Chip markieren + Hinweis, dass die Punktzahlen zum deployten Best gehören (der Kandidat, der
  gerade fährt, ist live ohnehin nicht mit Headless-Scores vergleichbar).
- Holdout/Dialog-Welten (Seeds 2001–2005), Ship-Gates, `shippedPolicyV3.json`: unberührt. Der 19-Routen-Gate misst
  weiterhin den eingebackenen Kandidaten — das ist gewollt.
- **Welt neu laden vor jedem Run** (Repo-Regel: deterministische Starts — siehe AGENTS.md
  „reload the world before every run"). Kandidatenwechsel = Welt-Reload mit Override.

## Facts (verifiziert 2026-10-11)

- Dialog: `src/components/MazeTrainingDialog.tsx` — Headerleiste = `maze-training-panel-header` (Strip, klickbar,
  drag-bar). Dort sitzen „Training Mazes", „N runs", `Σ Best/Σ Worst` (Test-ID `maze-training-header-totals`),
  Close-Button. Der Dialog lädt metas per `fetch(`${BASE_URL}exampleWorlds/<id>/meta.json`)`; Kachel-Klick geht über
  `onPlayExampleWorld(worldId, routeIndex)` an den Builder (Dialog besitzt das Laden nicht selbst — der Override muss
  also durchgereicht werden: neue Prop oder ein Kontext/Store, das der Builder beim Laden konsumiert).
- Kandidaten-Genome: `state.islands[k].es.theta` (698-dim, v3, H=24) direkt aus der Run-Datei lesbar; Formate:
  `{genome: number[]}` (latest-best.json) oder `{best: {genome}}` (Run-Datei) — `v2GenomeFromFile` (chainReport.ts)
  normalisiert beides; shipped: `shippedGenomeV3()` (exampleWorld.ts).
- Export/Pinning-Pattern zum Kopieren: `train-ctl.mjs trial [file]` — `copyFileSync(path, '.trial-snapshot.json')`,
  dann `RENN_V3_GENOME_FILE=<snap> npx tsx tools/renn-mcp/export-maze-training-worlds.ts --score`, dann Gate.
- Meta-Label des deployten Kandidaten: `public/exampleWorlds/maze_train_N/meta.json` → `candidate.label`
  (z. B. „v3mg7 trial (gen N)") — die Zeilen im Dialog zeigen es bereits in der expandierten Zeile.
- Training läuft kontinuierlich (~90 % CPU; `caffeinate` hält den Mac wach; vitest unter Last ~3× langsamer ->
  großzügige Timeouts). State jeden Gen gesichert; **v3mg7.json regelmäßig committen, NIEMALS git stash.**

## Vorschlag Umfang (mit Manuel abstimmen, wo offen)

1. Export-Skript: candidates.json alle ~20 Gens (dort wo auch latest-stats.json geschrieben wird —
   `run-islands.ts` hat die writeLatestStats-Infrastruktur; alternativ im auto-trial-Watcher ergänzen).
2. Dialog: Chips in der Headerleiste (kompakt, fontSize 10–11 wie die anderen Labels): `I1 I2 I3 | Best | Shipped`,
   aktiver Chip akzentuiert (theme.accent-Border wie die Route-Tiles), Persistenz der Wahl, „zurück zum Best"-Chip
   oder nochmal Klick = Reset.
3. Builder-Integration: Override-Prop/Store; beim Laden einer maze_train_Welt Genome tauschen; Metadaten
   (age/origin) als title-Tooltip pro Chip.
4. Tests: Dialog-Tests im Stil `MazeTrainingDialog.test.tsx` (fetch-Stubs; Chips rendern, aktive Markierung,
   Persistenz); falls Builder-Override: Szenario-Test nach dem Muster in `src/test/scenarios/` mit
   `MAZE_TRAIN_SIM=1`; danach `npx vitest run src/policyEvolution` (muss grün bleiben) + Full-Suite + `tsc` + eslint.
5. **Nach jedem fertigen, user-sichtbaren Schritt: commit, push, `npm run deploy`** (AGENTS.md-Regel) und Manuel
   sagen, was er auf der Live-Site nachschauen soll.

## Offene Fragen an Manuel (vor dem Bau klären, kurz)

- Genügen die 3 Inselzentren + Best + Shipped, oder soll man auch frühere Bests aus der History laden können?
- Soll der Override auch im hochgeladenen Live-System funktionieren (dann MUSS Weg (a) genommen werden und
  candidates.json muss mit deployed werden) oder nur lokal im Dev?

## Standing rules (unverändert)

Antwort an Manuel auf Deutsch. Keine Kriterien/Gates/Oracles lockern. Full vitest + `npx tsc --noEmit -p
tsconfig.app.json` + eslint auf geänderten Dateien vor jedem Deploy; Deploy nach jedem user-sichtbaren Schritt,
Ship-Entscheidung braucht Manuel's OK. Branch: `claude/autonomous-car-evolution-9p6zt2`.
