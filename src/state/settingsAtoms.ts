/**
 * User preferences and app-wide settings atoms.
 * Covers fonts, notation style, sounds, theme, sessions, sidebar layout,
 * and Lichess explorer options (stored persistently as user preferences).
 */
import type { MantineColor } from "@mantine/core";
import { atomWithStorage } from "jotai/utils";
import {
  type LichessGamesOptions,
  lichessGamesOptionsSchema,
  type MasterGamesOptions,
  masterOptionsSchema,
} from "@/utils/lichess/explorer";
import type { Session } from "@/utils/session";
import { createZodStorage } from "./utils";

// Directory preference
export const storedDocumentDirAtom = atomWithStorage<string>("document-dir", "", undefined, { getOnInit: true });

// Typography / notation
export const fontSizeAtom = atomWithStorage(
  "font-size",
  Number.parseInt(document.documentElement.style.fontSize, 10) || 100,
);
export const moveNotationTypeAtom = atomWithStorage<"letters" | "symbols" | "letters-translated">("letters", "symbols");
export const moveMethodAtom = atomWithStorage<"drag" | "select" | "both">("move-method", "drag");
export const spellCheckAtom = atomWithStorage<boolean>("spell-check", false);
export const moveInputAtom = atomWithStorage<boolean>("move-input", false);

// Sound
export const soundCollectionAtom = atomWithStorage<string>("sound-collection", "standard", undefined, {
  getOnInit: true,
});
export const soundVolumeAtom = atomWithStorage<number>("sound-volume", 0.8, undefined, {
  getOnInit: true,
});

// Theme & identity
// Legacy primary color atom for backward compatibility
export const primaryColorAtom = atomWithStorage<MantineColor>("mantine-primary-color", "blue");
export const sessionsAtom = atomWithStorage<Session[]>("sessions", []);
export const nativeBarAtom = atomWithStorage<boolean>("native-bar", false);
export const showDashboardOnStartupAtom = atomWithStorage<boolean>("show-dashboard-on-startup", true, undefined, {
  getOnInit: true,
});

// Sidebar quick actions
export const showPlayInSidebarAtom = atomWithStorage<boolean>("show-play-in-sidebar", false, undefined, {
  getOnInit: true,
});
export const showAnalyzeInSidebarAtom = atomWithStorage<boolean>("show-analyze-in-sidebar", false, undefined, {
  getOnInit: true,
});
export const showPuzzlesInSidebarAtom = atomWithStorage<boolean>("show-puzzles-in-sidebar", false, undefined, {
  getOnInit: true,
});

// Opening report thresholds
export const percentageCoverageAtom = atomWithStorage<number>("percentage-coverage", 95);
export const minimumGamesAtom = atomWithStorage<number>("minimum-games", 5);

// Lichess explorer options (persistent user preferences, not per-tab)
export const lichessOptionsAtom = atomWithStorage<LichessGamesOptions>(
  "lichess-all-options",
  {
    ratings: [1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500],
    speeds: ["bullet", "blitz", "rapid", "classical", "correspondence"],
    color: "white",
  },
  createZodStorage(lichessGamesOptionsSchema, localStorage),
  {
    getOnInit: true,
  },
);

export const masterOptionsAtom = atomWithStorage<MasterGamesOptions>(
  "lichess-master-options",
  {},
  createZodStorage(masterOptionsSchema, localStorage),
  {
    getOnInit: true,
  },
);
