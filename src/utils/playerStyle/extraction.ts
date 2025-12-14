/**
 * Extract ECO codes and opening names from PlayerGameInfo.
 * Returns only the most common openings (top 10 or until 50% of games are covered).
 * This focuses the style analysis on the player's core repertoire rather than rare openings.
 */

import { extractEcoFromOpening } from "./ecoExtraction";

export function extractEcosFromPlayerInfo(
  info: { site_stats_data: Array<{ data: Array<{ opening: string }> }> } | null | undefined,
): Array<{ eco: string; openingName: string; count: number }> {
  if (!info?.site_stats_data) return [];

  // Count occurrences of each opening
  const openingCounts = new Map<string, { eco: string; openingName: string; count: number }>();
  let totalGames = 0;

  for (const siteData of info.site_stats_data) {
    for (const game of siteData.data) {
      totalGames++;
      const eco = extractEcoFromOpening(game.opening);
      if (eco && game.opening) {
        const key = `${eco}:${game.opening}`;
        const existing = openingCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          openingCounts.set(key, { eco, openingName: game.opening, count: 1 });
        }
      }
    }
  }

  // Sort by count (descending) and take top openings
  const sortedOpenings = Array.from(openingCounts.values()).sort((a, b) => b.count - a.count);

  // Take top 10 openings OR until we cover 50% of games
  const targetGames = Math.ceil(totalGames * 0.5);
  const selectedOpenings: Array<{ eco: string; openingName: string; count: number }> = [];
  let cumulativeGames = 0;

  for (const opening of sortedOpenings) {
    selectedOpenings.push(opening);
    cumulativeGames += opening.count;

    // Stop if we have 10 openings OR we've covered 50% of games
    if (selectedOpenings.length >= 10 || cumulativeGames >= targetGames) {
      break;
    }
  }

  return selectedOpenings;
}
