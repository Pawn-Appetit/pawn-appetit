# Copilot / AI Agent Instructions — Pawn Appétit

Short, actionable guidance to help AI coding agents be productive in this repository.

## Purpose
- Help contributors make safe, focused changes across the React frontend (`src/`) and Tauri/Rust host (`src-tauri/`).
- Preserve runtime boundaries: avoid large Rust/Tauri edits unless the change requires native APIs.

## Big picture
- Frontend: `src/` — React + TypeScript UI, routes under `routes/`, components in `components/`, locales in `src/locales/`.
- Host / native: `src-tauri/` — Rust + Tauri configuration and platform integration (file system, engines, DB). Treat this as the native boundary.
- Build/IPC: the app uses Tauri bridging (bindings under `src/bindings/` and `src-tauri`) to call native features. Changes that cross that bridge require updating both sides.
- Data: local SQLite migrations and queries live in `database/`. SQL schema and seeds are source-of-truth for on-disk DB structure.

## Key files to inspect for context
- `package.json` — scripts and dev commands (use `pnpm`).
- `README.md` — development notes, Docker, and Tauri guidance.
- `src/App.tsx` and `src/index.tsx` — app entrypoints.
- `src-tauri/tauri.conf.json` and `src-tauri/src` — native settings and Rust code.
- `src/bindings/generated.ts` — generated Tauri bindings; update process requires running build tools.
- `database/` — migrations, pragmas, queries, seeds.

## Common developer workflows (explicit commands)
- Install: `pnpm install` (project uses `pnpm`).
- Dev (desktop app): `pnpm dev` (runs `tauri dev`).
- Dev-only frontend vite server: `pnpm start-vite`.
- Build frontend: `pnpm build-vite` (runs `tsc --noEmit && vite build`).
- Build desktop app: `pnpm build` (calls `tauri build --no-bundle`).
- Lint/typecheck: `pnpm lint` (runs `tsc --noEmit && biome check ./src`).
- Format: `pnpm format` (uses `biome`).
- Tests: `pnpm test` (runs `vitest run`).

When making changes that touch Rust/tauri, prefer `pnpm dev` to iterate (it starts the Tauri dev runner).

## Project-specific conventions & patterns
- Package manager: `pnpm` is required (see `packageManager` in `package.json`).
- Formatting & linting: `biome` is used (`biome format` / `biome check`). Do not replace with Prettier/eslint unless PR explicitly updates tooling.
- Type-check gating: CI uses `tsc --noEmit` frequently; include `--noEmit` checks when adding TS changes.
- i18n: translations live in `src/locales/` and scripts `scripts/update-missing-translations.ts` exist to sync keys — update those when touching user-visible text.
- Styling: uses `@vanilla-extract/css` and many `public/*.css` pieces for chess piece themes.

## Integration points & external dependencies
- Tauri plugins are used extensively (`@tauri-apps/plugin-*`): changes that require filesystem, process, or engine spawning must be coordinated with `src-tauri` Rust side.
- Chess logic: `chessops` and `@lichess-org/chessground` are used for board state and UI.
- Engines & external processes: engine management runs via Tauri `plugin-process` / `plugin-shell`; be careful when modifying engine orchestration code.
- Database: migrations and queries in `database/` are authoritative — if changing schemas update migration SQL and seeds.

## How AI agents should make changes
- Small UI/TS fixes: modify `src/` files, run `pnpm lint` and `pnpm test` locally where possible.
- Cross-boundary changes: if a change adds a new native capability (filesystem path, engine, new plugin), update `src-tauri/` accordingly and mention why in the PR.
- Generated bindings: do not hand-edit `src/bindings/generated.ts` unless you also run the generation/build step and document it.
- Database changes: add SQL under `database/migrations/` and update corresponding queries under `database/queries/`.

## Do / Don't (quick checklist)
- Do run `pnpm lint` and `pnpm test` after code edits.
- Do reference `src-tauri/tauri.conf.json` when changing native permissions or plugin settings.
- Don't modify Rust/Tauri files without running the dev build (`pnpm dev`) to verify IPC and native behavior.
- Don't change global tooling (switch package manager, replace `biome`) in small PRs.

## Useful examples / quick pointers
- To add a new UI route: add the route under `src/routes/`, update `routeTree.gen.ts` if needed, and test the app in `pnpm start-vite` or `pnpm dev`.
- To add a SQL column: add a migration under `database/migrations/` and update corresponding queries under `database/queries/`.
- To debug native calls: check `src/bindings/`, then `src-tauri/src` handlers and run `pnpm dev` to see console logs from both JS and Rust.

## After-edit checklist to include in PRs
- `pnpm lint` passes.
- `pnpm test` passes (where applicable).
- If UI changes: include screenshot/gif and i18n key updates if visible text changed.
- If native changes: note Tauri/Rust implications and platform considerations in PR description.

If any of the above is unclear or you want me to expand/merge content from an existing internal doc, tell me which parts to refine and I'll iterate.
