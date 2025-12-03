/**
 * Analyze opening characteristics from opening names.
 * Determines if an opening is a gambit, positional, tactical, hypermodern, etc.
 */

import type { OpeningCharacteristics } from "./types";

/**
 * Analyze opening characteristics from the full opening name.
 */
export function analyzeOpeningCharacteristics(openingName: string): OpeningCharacteristics {
  if (!openingName) {
    return {
      isGambit: false,
      isPositional: false,
      isTactical: false,
      isHypermodern: false,
      isSolid: false,
      isSystematic: false,
      isOffbeat: false,
      isDynamic: false,
    };
  }

  const lower = openingName.toLowerCase();
  const characteristics: OpeningCharacteristics = {
    isGambit: false,
    isPositional: false,
    isTactical: false,
    isHypermodern: false,
    isSolid: false,
    isSystematic: false,
    isOffbeat: false,
    isDynamic: false,
  };

  // --- GAMBIT DETECTION ---
  const gambitKeywords = [
    "gambit",
    "countergambit",
    "birmingham gambit",
    "benko gambit",
    "volga gambit",
    "budapest gambit",
    "albin countergambit",
    "englund gambit",
    "rousseau gambit",
    "blackmar-diemer",
    "blackmar diemer",
    "king's gambit",
    "kings gambit",
    "evans gambit",
    "danish gambit",
    "halloween gambit",
    "muzio gambit",
    "scotch gambit",
    "vienna gambit",
    "elephant gambit",
    "latvian gambit",
    "staunton gambit",
    "from's gambit",
    "benoni gambit",
    "benoni gambit accepted",
    "blumenfeld countergambit",
    "polovodin gambit",
    "spassky gambit",
    "hungarian gambit",
    "devin gambit",
    "polugaevsky gambit",
    "taimanov gambit",
    "averbakh gambit",
    "vitolins-adorjan gambit",
    "belyavsky gambit",
    "adorjan gambit",
    "leko gambit",
    "florentine gambit",
    "sämisch gambit",
    "kozul gambit",
    "shocron gambit",
    "romanovsky gambit",
    "hartlaub-charlick",
    "blackburne-kostić",
    "blackburne kostic",
    "king's gambit accepted",
    "kings gambit accepted",
  ];

  if (gambitKeywords.some((keyword) => lower.includes(keyword)) && !lower.includes("declined")) {
    characteristics.isGambit = true;
    characteristics.isTactical = true;
    characteristics.isDynamic = true;
  }

  // --- POSITIONAL OPENINGS ---
  // Note: Fianchetto-based openings are hypermodern, not just positional
  const positionalKeywords = [
    "catalan",
    "english opening",
    "reti",
    "queen's gambit declined",
    "queens gambit declined",
    "qgd",
    "slav",
    "semi-slav",
    "semislav",
    "ruy lopez",
    "spanish",
    "french defense",
    "caro-kann",
    "philidor",
    "petrov",
    "petrov's",
    "bogo-indian",
    "queen's indian",
    "queens indian",
    "nimzo-indian",
    "nimzo indian",
    "classical",
    "main line",
    "traditional",
    "orthodox",
    "exchange variation",
    "closed",
  ];

  if (positionalKeywords.some((keyword) => lower.includes(keyword))) {
    characteristics.isPositional = true;
    characteristics.isSolid = true;
  }

  // --- TACTICAL OPENINGS ---
  const tacticalKeywords = [
    "sicilian",
    "dragon",
    "najdorf",
    "scheveningen",
    "sveshnikov",
    "kalashnikov",
    "taimanov",
    "kan",
    "dragon variation",
    "sharp",
    "aggressive",
    "attack",
    "sacrifice",
    "sac",
    "tactical",
  ];

  if (tacticalKeywords.some((keyword) => lower.includes(keyword))) {
    characteristics.isTactical = true;
    characteristics.isDynamic = true;
  }

  // --- HYPERMODERN OPENINGS ---
  // Hypermodern openings control the center from a distance using flank development
  const hypermodernKeywords = [
    "king's indian",
    "kings indian",
    "grünfeld",
    "grunfeld",
    "benoni",
    "modern defense",
    "robatsch",
    "pirc",
    "nimzowitsch-larsen",
    "nimzo-larsen",
    "nimzo larsen",
    "larsen's",
    "larsen",
    "zukertort",
    "reti",
    "alekhine",
    "hypermodern",
    "fianchetto",
    "fianchettoed",
    "hyperaccelerated",
    "hyperaccelerated dragon",
    "king's english",
    "kings english",
    "english variation",
    "english opening",
    "catalan",
  ];

  if (hypermodernKeywords.some((keyword) => lower.includes(keyword))) {
    characteristics.isHypermodern = true;
    characteristics.isDynamic = true;
    characteristics.isPositional = true;
    // Hypermodern openings are NOT offbeat - they are a recognized strategic approach
    characteristics.isOffbeat = false;
  }

  // --- SOLID OPENINGS ---
  const solidKeywords = [
    "french defense",
    "caro-kann",
    "philidor",
    "petrov",
    "petrov's",
    "queen's gambit declined",
    "queens gambit declined",
    "qgd",
    "slav",
    "semi-slav",
    "semislav",
    "solid",
    "safe",
    "defensive",
  ];

  if (solidKeywords.some((keyword) => lower.includes(keyword))) {
    characteristics.isSolid = true;
    characteristics.isPositional = true;
  }

  // --- SYSTEMATIC OPENINGS ---
  const systematicKeywords = [
    "london system",
    "london",
    "colle system",
    "colle",
    "torre attack",
    "torre",
    "system",
    "systematic",
    "king's indian attack",
    "kings indian attack",
  ];

  if (systematicKeywords.some((keyword) => lower.includes(keyword))) {
    characteristics.isSystematic = true;
    characteristics.isPositional = true;
  }

  // --- OFFBEAT / IRREGULAR ---
  // Note: Hypermodern openings (Nimzo-Larsen, Modern Defense, Pirc, etc.) are NOT offbeat
  const offbeatKeywords = [
    "polish opening",
    "sokolsky",
    "bird opening",
    "barnes",
    "grob",
    "amsterdam",
    "anderssen",
    "clemenz",
    "crab",
    "hippopotamus",
    "kádas",
    "mieses",
    "saragossa",
    "sodium",
    "valencia",
    "van geet",
    "irregular",
    "unusual",
    "rare",
    "offbeat",
  ];

  if (offbeatKeywords.some((keyword) => lower.includes(keyword))) {
    characteristics.isOffbeat = true;
  }

  // --- DYNAMIC OPENINGS ---
  const dynamicKeywords = [
    "sicilian",
    "dragon",
    "king's indian",
    "kings indian",
    "grünfeld",
    "grunfeld",
    "benoni",
    "modern",
    "pirc",
    "dutch",
    "scandinavian",
    "alekhine",
    "hypermodern",
    "dynamic",
    "counterattack",
    "counterplay",
  ];

  if (dynamicKeywords.some((keyword) => lower.includes(keyword))) {
    characteristics.isDynamic = true;
  }

  // Special cases

  // King's Indian Attack: systematic and positional
  if (lower.includes("king's indian attack") || lower.includes("kings indian attack")) {
    characteristics.isSystematic = true;
    characteristics.isPositional = true;
  }

  // "Indian Defense" family is typically hypermodern & dynamic
  if (lower.includes("indian") && (lower.includes("defense") || lower.includes("variation"))) {
    characteristics.isHypermodern = true;
    characteristics.isDynamic = true;
    characteristics.isOffbeat = false; // Indian defenses are mainstream hypermodern
    if (!lower.includes("queen's indian") && !lower.includes("queens indian")) {
      characteristics.isTactical = true;
    }
  }

  // Sicilian
  if (lower.includes("sicilian")) {
    characteristics.isTactical = true;
    characteristics.isDynamic = true;
    // Hyperaccelerated Dragon is hypermodern
    if (lower.includes("hyperaccelerated") || lower.includes("hyper-accelerated")) {
      characteristics.isHypermodern = true;
    }
  }

  // French
  if (lower.includes("french")) {
    characteristics.isSolid = true;
    characteristics.isPositional = true;
  }

  // Caro-Kann
  if (lower.includes("caro") || lower.includes("kann")) {
    characteristics.isSolid = true;
    characteristics.isPositional = true;
  }

  // Ruy Lopez / Spanish
  if (lower.includes("ruy lopez") || lower.includes("spanish")) {
    characteristics.isPositional = true;
    characteristics.isSolid = true;
  }

  // English Opening - can be positional or hypermodern depending on variation
  if (lower.includes("english opening") || lower.includes("english")) {
    characteristics.isPositional = true;
    // King's English and fianchetto variations are hypermodern
    if (lower.includes("king's english") || lower.includes("kings english") || lower.includes("fianchetto")) {
      characteristics.isHypermodern = true;
      characteristics.isDynamic = true;
      characteristics.isOffbeat = false;
    } else {
      characteristics.isSolid = true;
    }
  }

  // QGD
  if (lower.includes("queen's gambit declined") || lower.includes("queens gambit declined") || lower.includes("qgd")) {
    characteristics.isSolid = true;
    characteristics.isPositional = true;
  }

  // Slav
  if (lower.includes("slav")) {
    characteristics.isSolid = true;
    characteristics.isPositional = true;
  }

  // Benoni
  if (lower.includes("benoni")) {
    characteristics.isDynamic = true;
    characteristics.isTactical = true;
    if (lower.includes("old benoni")) {
      characteristics.isOffbeat = true;
    }
    if (lower.includes("modern benoni")) {
      characteristics.isHypermodern = true;
    }
  }

  // Scandinavian
  if (lower.includes("scandinavian")) {
    characteristics.isOffbeat = true;
    characteristics.isDynamic = true;
    if (lower.includes("main line")) {
      characteristics.isPositional = true;
    }
    if (lower.includes("mieses") || lower.includes("kotroc")) {
      characteristics.isTactical = true;
    }
  }

  // Horwitz
  if (lower.includes("horwitz")) {
    characteristics.isOffbeat = true;
    characteristics.isDynamic = true;
  }

  // Polish
  if (lower.includes("polish opening")) {
    characteristics.isOffbeat = true;
    if (
      lower.includes("czech defense") ||
      lower.includes("king's indian variation") ||
      lower.includes("kings indian variation")
    ) {
      characteristics.isPositional = true;
      characteristics.isDynamic = true;
    }
    if (lower.includes("outflank")) {
      characteristics.isTactical = true;
    }
  }

  // French variations
  if (lower.includes("french")) {
    if (lower.includes("knight variation") || lower.includes("two knights")) {
      characteristics.isPositional = true;
    }
    if (lower.includes("winawer") || lower.includes("advance")) {
      characteristics.isDynamic = true;
      characteristics.isTactical = true;
    }
  }

  // Italian
  if (lower.includes("italian")) {
    characteristics.isPositional = true;
    if (lower.includes("rousseau") || lower.includes("blackburne")) {
      characteristics.isGambit = true;
      characteristics.isTactical = true;
    }
  }

  // Ruy Lopez variations
  if (lower.includes("ruy lopez") || lower.includes("spanish")) {
    if (lower.includes("classical")) {
      characteristics.isPositional = true;
      characteristics.isSolid = true;
    }
    if (lower.includes("marshall") || lower.includes("open")) {
      characteristics.isTactical = true;
      characteristics.isDynamic = true;
    }
  }

  // Sicilian closed
  if (lower.includes("sicilian")) {
    if (lower.includes("closed")) {
      characteristics.isPositional = true;
    }
    if (lower.includes("old sicilian")) {
      characteristics.isTactical = true;
      characteristics.isDynamic = true;
    }
  }

  // QGA
  if (lower.includes("queen's gambit accepted") || lower.includes("queens gambit accepted") || lower.includes("qga")) {
    characteristics.isPositional = true;
    characteristics.isDynamic = true;
    characteristics.isGambit = false;
  }

  // Knights openings
  if (lower.includes("four knights") || lower.includes("three knights")) {
    characteristics.isPositional = true;
    characteristics.isSolid = true;
  }

  // Bishop's
  if (lower.includes("bishop's opening") || lower.includes("bishops opening")) {
    characteristics.isPositional = true;
  }

  // Scotch
  if (lower.includes("scotch game") || lower.includes("scotch")) {
    characteristics.isTactical = true;
    characteristics.isDynamic = true;
  }

  return characteristics;
}

/**
 * Convenience wrapper to detect gambits directly from the name.
 */
export function isGambitName(name: string): boolean {
  return analyzeOpeningCharacteristics(name).isGambit;
}



