import { commands } from "@/bindings/generated";
import { parsePgn, startingPosition } from "chessops/pgn";
import { makeFen } from "chessops/fen";
import { parseSan } from "chessops/san";

/**
 * Adds opening headers (ECO, Opening, Variation) to a single PGN string.
 * Extracts the FEN from the game after a few moves and queries the backend for opening info.
 */
export async function addOpeningHeadersToPgn(pgn: string): Promise<string> {
  try {
    // Parse the PGN using chessops
    const games = parsePgn(pgn);
    
    if (!games || games.length === 0) {
      console.warn("[addOpeningHeadersToPgn] No games found in PGN");
      return pgn;
    }
    
    const game = games[0];
    
    // Get the starting position
    let pos;
    try {
      pos = startingPosition(game.headers).unwrap();
    } catch (error) {
      console.warn("[addOpeningHeadersToPgn] Failed to get starting position:", error);
      return pgn;
    }
    
    // Iterate through ALL positions during the first 20 moves (40 half-moves)
    // and check each position against the opening database
    let bestOpening: { eco: string; opening: string; variation: string; halfMove: number } | null = null;
    let currentNode = game.moves;
    let halfMove = 0;
    const maxHalfMoves = 40; // 20 moves = 40 half-moves
    
    // Start from the initial position (half-move 0)
    while (halfMove <= maxHalfMoves && currentNode) {
      // Get FEN for current position
      const currentFen = makeFen(pos.toSetup());
      
      // Query backend for opening at this position
      try {
        const result = await commands.getOpeningInfoFromFen(currentFen);
        if (result.status === "ok" && result.data) {
          const { eco, opening } = result.data;
          
          // Accept if we have a valid opening (not Extra or FRC)
          if (eco && eco !== "Extra" && eco !== "FRC" && eco.trim().length > 0) {
            // Keep the most specific opening (the one that occurs later in the game)
            // This ensures we get the full opening name including variations
            if (!bestOpening || halfMove > bestOpening.halfMove) {
              bestOpening = {
                eco: result.data.eco,
                opening: result.data.opening,
                variation: result.data.variation,
                halfMove: halfMove,
              };
              console.log(`[addOpeningHeadersToPgn] Found opening at half-move ${halfMove}: "${result.data.opening}" (ECO: ${eco})`);
            }
          }
        }
      } catch (e) {
        // Continue to next position if query fails
        if (halfMove < 5) {
          console.warn(`[addOpeningHeadersToPgn] Error querying opening at half-move ${halfMove}:`, e);
        }
      }
      
      // Move to next position if there are more moves
      if (currentNode.children && currentNode.children.length > 0) {
        const mainMove = currentNode.children[0];
        const san = mainMove.data.san;
        
        // Parse and play the move
        const move = parseSan(pos, san);
        if (move) {
          pos.play(move);
          halfMove++;
          currentNode = mainMove;
        } else {
          // Invalid move, stop iteration
          break;
        }
      } else {
        // No more moves, stop iteration
        break;
      }
    }
    
    if (!bestOpening) {
      console.warn("[addOpeningHeadersToPgn] No opening found after iterating through positions");
      return pgn;
    }
    
    const { eco, opening, variation } = bestOpening;
    console.log(`[addOpeningHeadersToPgn] Using opening found at half-move ${bestOpening.halfMove}:`, { eco, opening, variation });
    
    // Validate that we have at least an ECO or Opening
    if (!eco && (!opening || opening.trim().length === 0)) {
      console.warn("[addOpeningHeadersToPgn] No valid opening data (eco or opening missing)");
      return pgn;
    }
    
    // Skip if ECO is "Extra" or "FRC" (these are not real openings)
    if (eco === "Extra" || eco === "FRC") {
      console.log("[addOpeningHeadersToPgn] Skipping Extra/FRC opening");
      return pgn;
    }
    
    console.log("[addOpeningHeadersToPgn] Found opening:", { eco, opening, variation });
      
      // Parse existing headers from PGN
      const lines = pgn.split("\n");
      const headerLines: string[] = [];
      const moveLines: string[] = [];
      let inHeaders = true;
      let foundEmptyLine = false;
      
      for (const line of lines) {
        if (inHeaders && line.trim().startsWith("[")) {
          headerLines.push(line);
        } else if (inHeaders && line.trim() === "") {
          foundEmptyLine = true;
          inHeaders = false;
        } else {
          if (!foundEmptyLine && inHeaders) {
            inHeaders = false;
          }
          moveLines.push(line);
        }
      }
      
      // Check if headers already exist
      const hasEco = headerLines.some((l) => l.trim().startsWith("[ECO"));
      const hasOpening = headerLines.some((l) => l.trim().startsWith("[Opening"));
      const hasVariation = headerLines.some((l) => l.trim().startsWith("[Variation"));
      
      // Add or update headers (always add if not present, update if present)
      // Add ECO if available and valid
      if (eco && eco !== "Extra" && eco !== "FRC" && eco.trim().length > 0) {
        if (!hasEco) {
          headerLines.push(`[ECO "${eco}"]`);
        } else {
          // Update existing ECO header
          const ecoIndex = headerLines.findIndex((l) => l.trim().startsWith("[ECO"));
          if (ecoIndex >= 0) {
            headerLines[ecoIndex] = `[ECO "${eco}"]`;
          }
        }
      }
      
      // Add Opening if available (even without ECO)
      if (opening && opening.trim().length > 0) {
        if (!hasOpening) {
          headerLines.push(`[Opening "${opening}"]`);
        } else {
          // Update existing Opening header
          const openingIndex = headerLines.findIndex((l) => l.trim().startsWith("[Opening"));
          if (openingIndex >= 0) {
            headerLines[openingIndex] = `[Opening "${opening}"]`;
          }
        }
      }
      
      // Add Variation if available
      if (variation && variation.trim().length > 0) {
        if (!hasVariation) {
          headerLines.push(`[Variation "${variation}"]`);
        } else {
          // Update existing Variation header
          const variationIndex = headerLines.findIndex((l) => l.trim().startsWith("[Variation"));
          if (variationIndex >= 0) {
            headerLines[variationIndex] = `[Variation "${variation}"]`;
          }
        }
      }
      
      // Combine headers and moves
      // Ensure there's exactly one empty line between headers and moves
      const enrichedPgn = [...headerLines, "", ...moveLines].join("\n");
      
      // Verify the headers are in the result
      const hasEcoInResult = enrichedPgn.includes(`[ECO "${eco}"]`);
      const hasOpeningInResult = opening ? enrichedPgn.includes(`[Opening "${opening}"]`) : false;
      const hasVariationInResult = variation ? enrichedPgn.includes(`[Variation "${variation}"]`) : true;
      
      if (hasEcoInResult || hasOpeningInResult) {
        console.log("[addOpeningHeadersToPgn] ✅ Successfully added headers. ECO:", eco, "Opening:", opening, "Variation:", variation);
        console.log("[addOpeningHeadersToPgn] Headers verification - ECO:", hasEcoInResult, "Opening:", hasOpeningInResult, "Variation:", hasVariationInResult);
        return enrichedPgn;
      } else {
        console.error("[addOpeningHeadersToPgn] ❌ Headers were not properly added to PGN!");
        console.error("[addOpeningHeadersToPgn] Expected ECO:", eco, "Opening:", opening, "Variation:", variation);
        console.error("[addOpeningHeadersToPgn] PGN preview (first 500 chars):", enrichedPgn.substring(0, 500));
        return pgn; // Return original if headers weren't added
      }
  } catch (error) {
    console.error("[addOpeningHeadersToPgn] Error adding opening headers to PGN:", error);
    // Return original PGN on error
    return pgn;
  }
}

/**
 * Adds opening headers to multiple PGN strings.
 * Processes them sequentially to avoid overwhelming the backend.
 */
export async function addOpeningHeadersToPgns(pgns: string[]): Promise<string[]> {
  const results: string[] = [];
  let successCount = 0;
  let failCount = 0;
  
  console.log(`[addOpeningHeadersToPgns] Processing ${pgns.length} PGNs`);
  
  for (let i = 0; i < pgns.length; i++) {
    const pgn = pgns[i];
    try {
      const enriched = await addOpeningHeadersToPgn(pgn);
      
      // Check if headers were actually added by comparing
      const originalHasEco = pgn.includes('[ECO "');
      const enrichedHasEco = enriched.includes('[ECO "');
      const originalHasOpening = pgn.includes('[Opening "');
      const enrichedHasOpening = enriched.includes('[Opening "');
      
      if (enrichedHasEco && !originalHasEco) {
        successCount++;
        console.log(`[addOpeningHeadersToPgns] Successfully added headers to PGN ${i + 1}/${pgns.length}`);
      } else if (enrichedHasOpening && !originalHasOpening) {
        successCount++;
        console.log(`[addOpeningHeadersToPgns] Successfully added headers to PGN ${i + 1}/${pgns.length}`);
      } else {
        failCount++;
        if (i < 5) { // Only log first 5 failures to avoid spam
          console.warn(`[addOpeningHeadersToPgns] No headers added to PGN ${i + 1}/${pgns.length}`);
        }
      }
      
      results.push(enriched);
    } catch (error) {
      console.error(`[addOpeningHeadersToPgns] Error processing PGN ${i + 1}:`, error);
      results.push(pgn); // Return original on error
      failCount++;
    }
  }
  
  console.log(`[addOpeningHeadersToPgns] Completed: ${successCount} succeeded, ${failCount} failed out of ${pgns.length} total`);
  
  return results;
}

