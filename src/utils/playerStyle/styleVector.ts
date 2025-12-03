/**
 * Calculate style vector from ECO codes and opening names.
 * Works with either `string[]` (ECO only), `{ eco, openingName }[]`, or `{ eco, openingName, count }[]`.
 * When counts are provided, each opening is weighted by its frequency in the player's repertoire.
 */

import type { StyleVector } from "./types";
import { analyzeOpeningCharacteristics } from "./characteristics";

export function styleFromEcoList(
  openings: Array<{ eco: string; openingName: string; count?: number }> | string[],
): StyleVector {
  const v: StyleVector = {
    tactico: 0,
    posicional: 0,
    solido: 0,
    gambitero: 0,
    offbeat: 0,
    sistematico: 0,
    dinamico: 0,
    hipermoderno: 0,
  };

  // Track distinct gambit ECOs to detect true gambiteers
  const gambitEcos = new Set<string>();

  const normalizedOpenings: Array<{ eco: string; openingName: string; count: number }> = openings.map((item) =>
    typeof item === "string" ? { eco: item, openingName: "", count: 1 } : { ...item, count: item.count || 1 },
  );

  for (const { eco, openingName, count } of normalizedOpenings) {
    const code = eco.toUpperCase().trim();
    if (!code || code.length < 2) continue;

    const letter = code[0];
    const num = parseInt(code.slice(1), 10);
    if (isNaN(num)) continue;

    const lowerOpening = openingName.toLowerCase();
    const characteristics = analyzeOpeningCharacteristics(openingName);
    const isGambit = characteristics.isGambit;

    // Weight each contribution by the opening's frequency in the player's repertoire
    const weight = count;

    // --- A00–A03: irregular (Grob, Polish, etc.) ---
    if (letter === "A" && num >= 0 && num <= 3) {
      v.offbeat += (characteristics.isOffbeat ? 4 : 3) * weight;
      v.tactico += (characteristics.isTactical ? 2 : 1) * weight;

      if (characteristics.isHypermodern) {
        v.hipermoderno += 3 * weight;
        v.dinamico += 2 * weight;
        v.posicional += 1 * weight;
        // Hypermodern openings are NOT offbeat
      }

      if (num === 1 || characteristics.isHypermodern) {
        // A01 is Nimzo-Larsen - hypermodern, not offbeat
        if (characteristics.isHypermodern) {
          v.hipermoderno += 2 * weight;
          v.dinamico += 2 * weight;
          v.posicional += 1 * weight;
        } else {
          v.offbeat += 2 * weight;
          v.dinamico += 2 * weight;
          v.posicional += 1 * weight;
        }
      }

      if (isGambit) {
        v.gambitero += 3 * weight;
        gambitEcos.add(code);
      }

      if (lowerOpening.includes("polish opening") && !isGambit) {
        v.offbeat += 1 * weight;
        v.posicional += 1 * weight;
      }
    }

    // --- A04–A09: Reti / Zukertort / KIA ---
    if (letter === "A" && num >= 4 && num <= 9) {
      v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
      v.sistematico += (characteristics.isSystematic ? 3 : 2) * weight;
      v.solido += (characteristics.isSolid ? 2 : 1) * weight;

      if (num === 4 || characteristics.isHypermodern) {
        // A04 is Zukertort - hypermodern, not offbeat
        if (characteristics.isHypermodern) {
          v.hipermoderno += 2 * weight;
          v.dinamico += 1 * weight;
        } else {
          v.offbeat += 2 * weight;
          v.dinamico += 1 * weight;
        }
      }

      if (num === 7 || characteristics.isSystematic) {
        v.sistematico += 1 * weight;
        v.posicional += 1 * weight;
      }
    }

    // --- A10–A39: English ---
    if (letter === "A" && num >= 10 && num <= 39) {
      if (characteristics.isHypermodern) {
        // King's English and fianchetto variations are hypermodern
        v.hipermoderno += 3 * weight;
        v.posicional += 2 * weight;
        v.dinamico += 2 * weight;
      } else {
        v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
        v.solido += (characteristics.isSolid ? 2 : 1) * weight;
        v.dinamico += (characteristics.isDynamic ? 2 : 1) * weight;
      }
    }

    // --- A40–A45: offbeat queen pawn (Englund etc.) ---
    if (letter === "A" && num >= 40 && num <= 45) {
      v.offbeat += 3 * weight;
      v.tactico += 2 * weight;
      if (isGambit) {
        v.gambitero += 4 * weight;
        gambitEcos.add(code);
      }
    }

    // --- A46–A48: Torre / London (system players) ---
    if (letter === "A" && num >= 46 && num <= 48) {
      v.sistematico += 3 * weight;
      v.posicional += 2 * weight;
      v.solido += 2 * weight;
    }

    // --- A50–A55: offbeat Indians ---
    if (letter === "A" && num >= 50 && num <= 55) {
      v.offbeat += 2 * weight;
      v.dinamico += 2 * weight;
      v.tactico += 1 * weight;
    }

    // --- A56–A79: Benoni / Benko / Indians ---
    if (letter === "A" && num >= 56 && num <= 79) {
      v.dinamico += 3 * weight;
      v.tactico += 2 * weight;
      v.posicional += 1 * weight;
      if (isGambit) {
        v.gambitero += 3 * weight;
        gambitEcos.add(code);
      }
    }

    // --- A80–A99: Dutch family ---
    if (letter === "A" && num >= 80 && num <= 99) {
      v.dinamico += 3 * weight;
      v.tactico += 2 * weight;
      v.offbeat += 1 * weight;
      if (isGambit) {
        v.gambitero += 2 * weight;
        gambitEcos.add(code);
      }
    }

    // --- B00–B05: weird 1.e4 replies ---
    if (letter === "B" && num >= 0 && num <= 5) {
      v.offbeat += 3 * weight;
      v.tactico += 1 * weight;
      v.dinamico += 1 * weight;
    }

    // --- B01: Scandinavian ---
    if (letter === "B" && num === 1) {
      v.offbeat += 2 * weight;
      v.dinamico += 2 * weight;
      v.tactico += (characteristics.isTactical ? 2 : 1) * weight;
    }

    // --- B02–B09: Alekhine / Modern / Pirc ---
    if (letter === "B" && num >= 2 && num <= 9) {
      v.dinamico += (characteristics.isDynamic ? 3 : 2) * weight;
      v.posicional += (characteristics.isPositional ? 2 : 1) * weight;

      if (characteristics.isHypermodern) {
        // Modern Defense and Pirc are hypermodern, NOT offbeat
        v.hipermoderno += 3 * weight;
        v.dinamico += 1 * weight;
      } else if (characteristics.isOffbeat) {
        v.offbeat += 2 * weight;
      } else {
        v.offbeat += 1 * weight;
      }

      if (num >= 6 && num <= 9 || lowerOpening.includes("modern") || lowerOpening.includes("pirc")) {
        v.posicional += 1 * weight;
        if (characteristics.isHypermodern) {
          v.hipermoderno += 1 * weight;
        } else {
          v.offbeat += 1 * weight;
        }
      }
    }

    // --- B10–B19: Caro-Kann ---
    if (letter === "B" && num >= 10 && num <= 19) {
      v.solido += (characteristics.isSolid ? 3 : 2) * weight;
      v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
      v.tactico += (characteristics.isTactical ? 2 : 1) * weight;
    }

    // --- B20–B29: generic Sicilian ---
    if (letter === "B" && num >= 20 && num <= 29) {
      v.tactico += 2 * weight;
      v.dinamico += 2 * weight;
      v.posicional += 1 * weight;
    }

    // --- B30–B99: Sicilian mainline ---
    if (letter === "B" && num >= 30 && num <= 99) {
      v.tactico += (characteristics.isTactical ? 3 : 2) * weight;
      v.dinamico += (characteristics.isDynamic ? 3 : 2) * weight;
      v.posicional += (characteristics.isPositional ? 2 : 1) * weight;

      if (characteristics.isHypermodern) {
        // Hyperaccelerated Dragon is hypermodern
        v.hipermoderno += 3 * weight;
      }

      if (num >= 70 && num <= 79 || lowerOpening.includes("dragon")) {
        v.tactico += 1 * weight;
        v.dinamico += 1 * weight;
        // Hyperaccelerated Dragon variant
        if (lowerOpening.includes("hyperaccelerated")) {
          v.hipermoderno += 2 * weight;
        }
      }

      // Only add offbeat if it's truly offbeat and NOT hypermodern
      if ((num >= 30 && num <= 39 || characteristics.isOffbeat) && !characteristics.isHypermodern) {
        v.offbeat += 1 * weight;
      }

      if (lowerOpening.includes("closed")) {
        v.posicional += 1 * weight;
        v.tactico -= 1 * weight; // clamped later
      }
    }

    // --- C00–C19: French ---
    if (letter === "C" && num >= 0 && num <= 19) {
      v.solido += (characteristics.isSolid ? 3 : 2) * weight;
      v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
      v.tactico += (characteristics.isTactical ? 2 : 1) * weight;

      if (lowerOpening.includes("winawer") || lowerOpening.includes("variation")) {
        v.dinamico += 1 * weight;
      }
    }

    // --- C20–C39: 1.e4 gambits / open games ---
    if (letter === "C" && num >= 20 && num <= 39) {
      if (isGambit) {
        v.gambitero += 4 * weight;
        v.tactico += 3 * weight;
        v.dinamico += 2 * weight;
        v.offbeat += 1 * weight;
        gambitEcos.add(code);
      } else {
        v.tactico += 2 * weight;
        v.dinamico += 1 * weight;
      }
    }

    // --- C40: King's Knight families ---
    if (letter === "C" && num === 40) {
      if (isGambit) {
        v.gambitero += 3 * weight;
        v.tactico += 2 * weight;
        v.offbeat += 1 * weight;
        gambitEcos.add(code);
      } else {
        v.tactico += 1 * weight;
      }
    }

    // --- C41–C42: Philidor / Petrov ---
    if (letter === "C" && num >= 41 && num <= 42) {
      v.solido += 3 * weight;
      v.posicional += 2 * weight;
    }

    // --- C43–C44: Petrov / Scotch ---
    if (letter === "C" && num >= 43 && num <= 44) {
      v.posicional += 2 * weight;
      v.tactico += 2 * weight;
      v.solido += 1 * weight;
      if (num === 44 && isGambit) {
        v.gambitero += 2 * weight;
        gambitEcos.add(code);
      }
    }

    // --- C45–C46: Scotch / Three/Four Knights ---
    if (letter === "C" && num >= 45 && num <= 46) {
      v.posicional += 2 * weight;
      v.solido += 2 * weight;
      if (num === 46 && isGambit) {
        v.gambitero += 2 * weight;
        v.offbeat += 1 * weight;
        gambitEcos.add(code);
      }
    }

    // --- C47–C49: Four Knights ---
    if (letter === "C" && num >= 47 && num <= 49) {
      v.posicional += 2 * weight;
      v.solido += 2 * weight;
    }

    // --- C50–C59: Italian / Two Knights ---
    if (letter === "C" && num >= 50 && num <= 59) {
      v.posicional += 2 * weight;
      v.tactico += 2 * weight;
      v.solido += 1 * weight;
      if (isGambit) {
        v.gambitero += 3 * weight;
        v.offbeat += 1 * weight;
        gambitEcos.add(code);
      }
    }

    // --- C60–C99: Ruy Lopez ---
    if (letter === "C" && num >= 60 && num <= 99) {
      v.posicional += 3 * weight;
      v.solido += 2 * weight;
      v.tactico += 1 * weight;
    }

    // --- D00–D01: irregular d-pawn (Blackmar-Diemer etc.) ---
    if (letter === "D" && num >= 0 && num <= 1) {
      v.offbeat += 2 * weight;
      v.tactico += 2 * weight;
      if (isGambit) {
        v.gambitero += 3 * weight;
        gambitEcos.add(code);
      }
    }

    // --- D02–D05: London / Colle / Torre ---
    if (letter === "D" && num >= 2 && num <= 5) {
      v.sistematico += (characteristics.isSystematic ? 3 : 2) * weight;
      v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
      v.solido += (characteristics.isSolid ? 2 : 1) * weight;
    }

    // --- D06–D09: QGD odd lines / Albin etc. ---
    if (letter === "D" && num >= 6 && num <= 9) {
      v.solido += 3 * weight;
      v.posicional += 3 * weight;
      if (isGambit) {
        v.gambitero += 2 * weight;
        v.tactico += 1 * weight;
        gambitEcos.add(code);
      }
    }

    // --- D10–D19: Slav ---
    if (letter === "D" && num >= 10 && num <= 19) {
      v.solido += (characteristics.isSolid ? 3 : 2) * weight;
      v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
      v.dinamico += (characteristics.isDynamic ? 2 : 1) * weight;
    }

    // --- D20–D29: QGA ---
    if (letter === "D" && num >= 20 && num <= 29) {
      v.posicional += 3 * weight;
      v.dinamico += 2 * weight;
      v.solido += 1 * weight;
    }

    // --- D30–D49: QGD / Semi-Slav ---
    if (letter === "D" && num >= 30 && num <= 49) {
      v.solido += (characteristics.isSolid ? 3 : 2) * weight;
      v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
      v.dinamico += (characteristics.isDynamic ? 2 : 1) * weight;

      if (lowerOpening.includes("semi-slav") || lowerOpening.includes("semislav")) {
        v.dinamico += 1 * weight;
        v.tactico += 1 * weight;
      }
    }

    // --- D50–D79: various QGD families ---
    if (letter === "D" && num >= 50 && num <= 79) {
      v.solido += 3 * weight;
      v.posicional += 3 * weight;
    }

    // --- D80–D99: Grünfeld and friends ---
    if (letter === "D" && num >= 80 && num <= 99) {
      v.dinamico += (characteristics.isDynamic ? 3 : 2) * weight;
      v.tactico += (characteristics.isTactical ? 3 : 2) * weight;
      // Grünfeld is hypermodern
      if (characteristics.isHypermodern) {
        v.hipermoderno += 4 * weight;
        v.posicional += 2 * weight;
      } else {
        v.posicional += 1 * weight;
      }
    }

    // --- E00–E09: Catalan / misc. ---
    if (letter === "E" && num >= 0 && num <= 9) {
      v.posicional += 3 * weight;
      v.solido += 2 * weight;
      v.dinamico += 1 * weight;
      if (isGambit) {
        v.gambitero += 2 * weight;
        gambitEcos.add(code);
      }
    }

    // --- E10–E19: Blumenfeld / Bogo / Q-Indian ---
    if (letter === "E" && num >= 10 && num <= 19) {
      v.posicional += 2 * weight;
      v.dinamico += 2 * weight;
      if (isGambit) {
        v.gambitero += 2 * weight;
        v.tactico += 1 * weight;
        gambitEcos.add(code);
      }
    }

    // --- E20–E59: Nimzo / Bogo families ---
    if (letter === "E" && num >= 20 && num <= 59) {
      v.posicional += (characteristics.isPositional ? 3 : 2) * weight;
      v.dinamico += (characteristics.isDynamic ? 3 : 2) * weight;
      if (characteristics.isHypermodern) {
        v.hipermoderno += 3 * weight;
        v.dinamico += 1 * weight;
        v.posicional += 1 * weight;
      }
      if (isGambit) {
        v.gambitero += 2 * weight;
        v.tactico += 1 * weight;
        gambitEcos.add(code);
      }
    }

    // --- E60–E99: King's Indian family ---
    if (letter === "E" && num >= 60 && num <= 99) {
      v.dinamico += (characteristics.isDynamic ? 3 : 2) * weight;
      v.tactico += (characteristics.isTactical ? 3 : 2) * weight;

      // King's Indian is hypermodern
      if (characteristics.isHypermodern) {
        v.hipermoderno += 4 * weight;
        v.posicional += 2 * weight;
      } else {
        v.posicional += 1 * weight;
      }

      if (lowerOpening.includes("king's indian") || lowerOpening.includes("kings indian")) {
        v.hipermoderno += 1 * weight;
        v.dinamico += 1 * weight;
        v.posicional += 1 * weight;
      }

      if (isGambit) {
        v.gambitero += 2 * weight;
        gambitEcos.add(code);
      }
    }
  }

  // Bonus for players who use several distinct gambit ECO families
  if (gambitEcos.size >= 2) {
    v.gambitero += gambitEcos.size; // small extra
    v.offbeat += Math.floor(gambitEcos.size / 2);
  }

  // Clamp any negative component to zero
  (Object.keys(v) as (keyof StyleVector)[]).forEach((k) => {
    if (v[k] < 0) v[k] = 0;
  });

  return v;
}



