/**
 * Player Style Analysis based on ECO codes.
 * Analyzes a player's opening repertoire to determine their playing style.
 *
 * This module provides a high-level API for analyzing player styles.
 * The implementation is split across multiple modules for better maintainability:
 * - types.ts: Type definitions
 * - openingsMap.ts: Mapping of opening names to ECO codes
 * - characteristics.ts: Analysis of opening characteristics
 * - ecoExtraction.ts: Extraction of ECO codes from opening names
 * - styleVector.ts: Calculation of style vectors from ECO codes
 * - styleLabel.ts: Determination of style labels from vectors
 * - extraction.ts: Extraction of ECOs from player game info
 */

export type { StyleVector, PlayerStyleLabel } from "./types";
export { extractEcosFromPlayerInfo } from "./extraction";
export { styleFromEcoList } from "./styleVector";
export { getPlayerStyleLabel } from "./styleLabel";

/**
 * High-level helper: analyze player style from PlayerGameInfo.
 * Analyzes only the most common openings (top 10 or 50% of games) to focus on core repertoire.
 */
import { extractEcosFromPlayerInfo } from "./extraction";
import { styleFromEcoList } from "./styleVector";
import { getPlayerStyleLabel } from "./styleLabel";
import type { PlayerStyleLabel } from "./types";

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

