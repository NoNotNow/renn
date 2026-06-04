---
keywords:
  - error
  - compile
  - runtime
  - debug
  - performance
  - eval
  - sandbox
searchText: >-
  Compile errors forbidden eval runtime amber stacktrace state persisted performance getWorldPosition
  getEntity
---

- **Compile errors:** Syntax errors and forbidden helpers like {{eval|:eval}} appear under the editor.
- **Runtime errors:** Exceptions in {{transform|:transform()}} show an amber panel with a stack trace in Play / Builder.
- **{{state|:state}}:** Persists between frames until the transformer is rebuilt (reload world or change config). Reset keys when testing.
- **Performance:** Prefer {{getWorldPosition|:getWorldPosition}} over repeated {{getEntity|:getEntity}} calls in hot code.
