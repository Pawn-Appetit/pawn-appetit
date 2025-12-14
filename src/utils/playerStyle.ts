/**
 * Player Style Analysis based on ECO codes.
 * Analyzes a player's opening repertoire to determine their playing style.
 *
 * This file re-exports from the modular implementation in ./playerStyle/
 * to maintain backward compatibility with existing imports.
 */

export { extractEcosFromPlayerInfo } from "./playerStyle/extraction";
export { getPlayerStyleLabel } from "./playerStyle/styleLabel";
export { styleFromEcoList } from "./playerStyle/styleVector";
// Re-export all types and functions from the modular implementation
export type { PlayerStyleLabel, StyleVector } from "./playerStyle/types";

// Import dependencies for analyzePlayerStyle
import { extractEcosFromPlayerInfo } from "./playerStyle/extraction";
import { getPlayerStyleLabel } from "./playerStyle/styleLabel";
import { styleFromEcoList } from "./playerStyle/styleVector";
import type { PlayerStyleLabel } from "./playerStyle/types";

/**
 * High-level helper: analyze player style from PlayerGameInfo.
 * Analyzes only the most common openings (top 10 or 50% of games) to focus on core repertoire.
 */
export function analyzePlayerStyle(
  info: { site_stats_data: Array<{ data: Array<{ opening: string }> }> } | null | undefined,
): PlayerStyleLabel {
  const openings = extractEcosFromPlayerInfo(info);
  if (openings.length === 0) {
    return {
      label: "playerStyle.noData",
      description: "playerStyle.noDataDescription",
      color: "gray",
    };
  }

  const vector = styleFromEcoList(openings);
  return getPlayerStyleLabel(vector);
}
