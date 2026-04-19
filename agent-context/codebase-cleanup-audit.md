# Renn codebase cleanup audit

Completed cleanup passes and remaining optional follow-ups.

## Completed

Two passes (initial + intensification 2026-03) removed dead modules/exports, debug code, unused props, and consolidated duplicated utilities. Key results: `DB_CONFIG` as single source of truth, theme tokens in `config/theme.ts`, `BulkSpawnForm` extraction, `Modal.tsx` reuse, type safety improvements. All documented changes are in code.

## Optional follow-ups

- Migrate remaining components off raw hex (see ripgrep for `#1b1f2a`, `#2f3545`, etc.) toward `config/theme.ts`.
- Broader locale/styling tokens (radius scale, full i18n).
- `isGrounded` still TODO in `renderItemRegistry`.
- Project picker overlay: unify on `Modal.tsx` if/when it gets a dedicated component.

Run `npm run test:run` after further edits.
