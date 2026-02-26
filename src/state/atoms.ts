/**
 * Barrel re-export for all domain-scoped atom files.
 *
 * Import paths of the form `@/state/atoms` continue to work throughout the
 * codebase.  Import directly from the domain file when you want faster
 * hot-module replacement or to make the dependency explicit.
 *
 * Domain files:
 *   boardAtoms.ts    — board appearance & move interaction
 *   settingsAtoms.ts — persistent user preferences
 *   uiAtoms.ts       — tab management, per-tab panel atoms, tabValue helper
 *   gameAtoms.ts     — database selection, puzzle/game/practice state
 *   engineAtoms.ts   — engine list, best-move families, enable/disable
 */

export * from "./boardAtoms";
export * from "./settingsAtoms";
export * from "./uiAtoms";
export * from "./gameAtoms";
export * from "./engineAtoms";
