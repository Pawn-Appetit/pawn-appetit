/**
 * Extract ECO codes from opening names using multiple strategies.
 */

import { isGambitName } from "./characteristics";
import { SPECIFIC_OPENING_MAP } from "./openingsMap";

/**
 * Extract ECO code from a full opening name using multiple strategies.
 */
export function extractEcoFromOpening(openingName: string): string | null {
  if (!openingName || openingName.trim().length === 0) return null;

  const name = openingName.trim();
  const lowerName = name.toLowerCase();

  // Strategy 1: ECO at start ("B90 Sicilian Defense ...")
  const directMatch = name.match(/^([A-E]\d{2})\s/);
  if (directMatch) {
    return directMatch[1];
  }

  // Strategy 2: specific name → ECO map
  for (const [key, eco] of Object.entries(SPECIFIC_OPENING_MAP)) {
    if (lowerName.includes(key)) {
      return eco;
    }
  }

  // Strategy 3: any ECO pattern in the string
  const anyEcoMatch = name.match(/\b([A-E]\d{2})\b/);
  if (anyEcoMatch) {
    return anyEcoMatch[1];
  }

  // Strategy 4: infer from keywords / families

  // Sicilians (B30–B99)
  if (
    lowerName.includes("sicilian") ||
    lowerName.includes("dragon") ||
    lowerName.includes("najdorf") ||
    lowerName.includes("scheveningen") ||
    lowerName.includes("sveshnikov") ||
    lowerName.includes("kalashnikov") ||
    lowerName.includes("taimanov") ||
    lowerName.includes("kan")
  ) {
    const sicilianMatch = name.match(/\b([B]\d{2})\b/);
    if (sicilianMatch) {
      const num = parseInt(sicilianMatch[1].slice(1), 10);
      if (num >= 30 && num <= 99) {
        return sicilianMatch[1];
      }
    }
    return "B50";
  }

  // French (C00–C19)
  if (lowerName.includes("french")) {
    const frenchMatch = name.match(/\b([C]\d{2})\b/);
    if (frenchMatch) {
      const num = parseInt(frenchMatch[1].slice(1), 10);
      if (num <= 19) return frenchMatch[1];
    }
    return "C00";
  }

  // Caro-Kann (B10–B19)
  if (lowerName.includes("caro") || lowerName.includes("kann")) {
    const caroMatch = name.match(/\b([B]\d{2})\b/);
    if (caroMatch) {
      const num = parseInt(caroMatch[1].slice(1), 10);
      if (num >= 10 && num <= 19) return caroMatch[1];
    }
    return "B10";
  }

  // QG / Slav / Semi-Slav (D10–D19, D30–D49)
  if (
    lowerName.includes("queen's gambit") ||
    lowerName.includes("queens gambit") ||
    lowerName.includes("qgd") ||
    lowerName.includes("semi-slav") ||
    lowerName.includes("semislav") ||
    lowerName.includes("slav")
  ) {
    const qgMatch = name.match(/\b([D]\d{2})\b/);
    if (qgMatch) {
      const num = parseInt(qgMatch[1].slice(1), 10);
      if ((num >= 10 && num <= 19) || (num >= 30 && num <= 49)) {
        return qgMatch[1];
      }
    }
    return "D30";
  }

  // Indian / Benoni / Benko families
  if (
    lowerName.includes("indian") ||
    lowerName.includes("nimzo") ||
    lowerName.includes("bogo") ||
    lowerName.includes("grünfeld") ||
    lowerName.includes("grunfeld") ||
    lowerName.includes("king's indian") ||
    lowerName.includes("kings indian") ||
    lowerName.includes("queen's indian") ||
    lowerName.includes("queens indian") ||
    lowerName.includes("benoni") ||
    lowerName.includes("benko")
  ) {
    const indianMatch = name.match(/\b([A-D-E]\d{2})\b/);
    if (indianMatch) {
      const letter = indianMatch[1][0];
      const num = parseInt(indianMatch[1].slice(1), 10);
      if (
        (letter === "A" && num >= 56 && num <= 79) ||
        (letter === "D" && num >= 80 && num <= 99) ||
        (letter === "E" && ((num >= 20 && num <= 29) || (num >= 60 && num <= 99)))
      ) {
        return indianMatch[1];
      }
    }
    return "E20";
  }

  // London / Colle / Torre
  if (lowerName.includes("london") || lowerName.includes("colle") || lowerName.includes("torre")) {
    const systemMatch = name.match(/\b([A-D]\d{2})\b/);
    if (systemMatch) {
      const letter = systemMatch[1][0];
      const num = parseInt(systemMatch[1].slice(1), 10);
      if ((letter === "D" && num >= 2 && num <= 5) || (letter === "A" && num >= 46 && num <= 48)) {
        return systemMatch[1];
      }
    }
    return "D02";
  }

  // English / Reti
  if (lowerName.includes("english") || lowerName.includes("reti")) {
    const englishMatch = name.match(/\b([A]\d{2})\b/);
    if (englishMatch) {
      const num = parseInt(englishMatch[1].slice(1), 10);
      if ((num >= 4 && num <= 9) || (num >= 10 && num <= 39)) {
        return englishMatch[1];
      }
    }
    return "A10";
  }

  // Ruy Lopez / Spanish
  if (lowerName.includes("ruy lopez") || lowerName.includes("spanish")) {
    const ruyMatch = name.match(/\b([C]\d{2})\b/);
    if (ruyMatch) {
      const num = parseInt(ruyMatch[1].slice(1), 10);
      if (num >= 60 && num <= 99) {
        return ruyMatch[1];
      }
    }
    return "C60";
  }

  // Italian
  if (lowerName.includes("italian")) {
    return "C50";
  }

  // Scandinavian
  if (lowerName.includes("scandinavian")) {
    return "B01";
  }

  // Alekhine / Modern / Pirc (B02–B09)
  if (lowerName.includes("alekhine") || lowerName.includes("modern") || lowerName.includes("pirc")) {
    const modernMatch = name.match(/\b([B]\d{2})\b/);
    if (modernMatch) {
      const num = parseInt(modernMatch[1].slice(1), 10);
      if (num >= 2 && num <= 9) {
        return modernMatch[1];
      }
    }
    return "B06";
  }

  // Dutch
  if (lowerName.includes("dutch")) {
    return "A80";
  }

  // Generic fallback for gambits with unknown ECO
  if (isGambitName(name)) {
    const gambitMatch = name.match(/\b([A-E]\d{2})\b/);
    if (gambitMatch) {
      return gambitMatch[1];
    }
    if (lowerName.includes("king's") || lowerName.includes("kings")) {
      return "C30";
    }
    if (lowerName.includes("queen's") || lowerName.includes("queens")) {
      return "D20";
    }
    return "C20";
  }

  return null;
}
