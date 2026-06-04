---
keywords:
  - error
  - compile
  - runtime
  - debug
  - performance
  - eval
  - sandbox
  - fehler
searchText: >-
  Kompilierfehler eval verboten Laufzeitfehler amber state bleibt Performance getWorldPosition getEntity
---

- **Kompilierfehler:** Syntaxfehler und verbotene Helfer wie {{eval|:eval}} erscheinen unter dem Editor.
- **Laufzeitfehler:** Ausnahmen in {{transform|:transform()}} erscheinen als gelbes Fenster mit Fehlerliste — im Spielen und im Builder.
- **{{state|:state}}:** Bleibt zwischen den Schritten erhalten, bis der Transformer neu geladen wird (Welt neu laden oder Einstellung ändern). Beim Testen state-Werte zurücksetzen.
- **Performance:** Wenn der Code oft pro Schritt läuft: lieber {{getWorldPosition|:getWorldPosition}} als oft {{getEntity|:getEntity}} aufrufen.
