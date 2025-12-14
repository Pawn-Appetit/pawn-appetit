/**
 * Determine player style label based on the style vector.
 * Uses normalized percentages and combination rules.
 * Returns labels with translation keys for i18n support.
 */

import type { PlayerStyleLabel, StyleVector } from "./types";

export function getPlayerStyleLabel(vector: StyleVector): PlayerStyleLabel {
  const totalRaw = Object.values(vector).reduce((sum, val) => sum + val, 0);
  if (totalRaw === 0) {
    return {
      label: "playerStyle.mixedStyle",
      description: "playerStyle.mixedStyleDescription",
      color: "gray",
    };
  }

  // Normalize to percentages
  const normalized: StyleVector = {
    tactico: (vector.tactico / totalRaw) * 100,
    posicional: (vector.posicional / totalRaw) * 100,
    solido: (vector.solido / totalRaw) * 100,
    gambitero: (vector.gambitero / totalRaw) * 100,
    offbeat: (vector.offbeat / totalRaw) * 100,
    sistematico: (vector.sistematico / totalRaw) * 100,
    dinamico: (vector.dinamico / totalRaw) * 100,
    hipermoderno: (vector.hipermoderno / totalRaw) * 100,
  };

  const entries = (Object.entries(normalized) as [keyof StyleVector, number][]).sort((a, b) => b[1] - a[1]);

  const [primaryKey, primaryVal] = entries[0];
  const [, secondaryVal] = entries[1];

  const { tactico, posicional, solido, gambitero, offbeat, sistematico, dinamico, hipermoderno } = normalized;

  // If nothing clearly dominates, keep it mixed
  if (primaryVal < 16 && secondaryVal < 14) {
    return {
      label: "playerStyle.mixedStyle",
      description: "playerStyle.mixedStyleDescription",
      color: "gray",
    };
  }

  // ---- Derived metrics for style combinations ----
  const aggressiveBlend = (tactico + dinamico) / 2;

  const positionalCore = posicional >= 24 && posicional >= tactico && posicional >= dinamico;

  const gambitCore =
    gambitero >= 18 &&
    gambitero >= aggressiveBlend * 0.6 &&
    gambitero >= offbeat * 0.55 &&
    gambitero >= posicional * 0.6;

  const creativeGambiteer = gambitCore && offbeat >= 15;

  const systemsPlayer = sistematico >= 22 && posicional >= 18;

  // Only "unconventional" if offbeat dominates and player is NOT clearly positional or hypermodern
  const offbeatHeavy = offbeat >= 35 && gambitero < 20 && !positionalCore && hipermoderno < 20;

  const classicSolid = solido >= 24 && posicional >= 22 && dinamico < 26;

  const dynamicTactician = dinamico >= 25 && tactico >= 20 && gambitero < 24;

  // Hypermodern dynamic: prioritize if hipermoderno is significant
  const hypermodernDynamic =
    hipermoderno >= 20 && dinamico >= 20 && tactico >= 15 && (hipermoderno >= offbeat || offbeat < 25);

  // ---- Complex labels (order matters!) ----

  // 1) Creative gambiteer (Englund, Rousseau, King's Gambit, etc.)
  if (creativeGambiteer) {
    return {
      label: "playerStyle.creativeGambiteer",
      description: "playerStyle.creativeGambiteerDescription",
      color: "violet",
    };
  }

  // 2) Strong gambiteer without so much offbeat
  if (gambitCore) {
    return {
      label: "playerStyle.gambiteer",
      description: "playerStyle.gambiteerDescription",
      color: "violet",
    };
  }

  // 3) System player (London / Colle / Torre / KIA)
  if (systemsPlayer) {
    return {
      label: "playerStyle.systemPlayer",
      description: "playerStyle.systemPlayerDescription",
      color: "teal",
    };
  }

  // 4) Classical solid (QGD, Slav, French/Caro core)
  if (classicSolid) {
    return {
      label: "playerStyle.classicalSolid",
      description: "playerStyle.classicalSolidDescription",
      color: "blue",
    };
  }

  // 5) Hypermodern dynamic (KID, Grünfeld, Benoni, Modern Defense, Nimzo-Larsen, Hyperaccelerated Dragon)
  // Check BEFORE positional to prioritize hypermodern classification
  if (hypermodernDynamic) {
    return {
      label: "playerStyle.hypermodernDynamic",
      description: "playerStyle.hypermodernDynamicDescription",
      color: "orange",
    };
  }

  // 6) Positional core (only if NOT hypermodern)
  if (positionalCore && hipermoderno < 18 && (solido + sistematico >= 18 || offbeat <= 28)) {
    return {
      label: "playerStyle.positional",
      description: "playerStyle.positionalDescription",
      color: "cyan",
    };
  }

  // 7) Strongly unconventional repertoire
  if (offbeatHeavy) {
    return {
      label: "playerStyle.unconventionalOpenings",
      description: "playerStyle.unconventionalOpeningsDescription",
      color: "grape",
    };
  }

  // 8) Generic dynamic tactician
  if (dynamicTactician) {
    return {
      label: "playerStyle.dynamicTactician",
      description: "playerStyle.dynamicTacticianDescription",
      color: "red",
    };
  }

  // ---- Simple, axis-based labels ----

  if (gambitero >= 22) {
    return {
      label: "playerStyle.gambiteer",
      description: "playerStyle.gambiteerSimpleDescription",
      color: "violet",
    };
  }

  // Check hypermodern before other simple categories
  if (hipermoderno >= 22) {
    return {
      label: "playerStyle.hypermodernDynamic",
      description: "playerStyle.hypermodernDynamicDescription",
      color: "orange",
    };
  }

  if (offbeat >= 28 && gambitero < 22 && hipermoderno < 20) {
    return {
      label: "playerStyle.unconventional",
      description: "playerStyle.unconventionalDescription",
      color: "grape",
    };
  }

  if (sistematico >= 24) {
    return {
      label: "playerStyle.systematic",
      description: "playerStyle.systematicDescription",
      color: "teal",
    };
  }

  if (posicional >= 26 && posicional >= tactico && posicional >= dinamico && hipermoderno < 18) {
    return {
      label: "playerStyle.positional",
      description: "playerStyle.positionalSimpleDescription",
      color: "cyan",
    };
  }

  if (tactico >= 26 && tactico >= posicional && tactico >= solido) {
    return {
      label: "playerStyle.tactical",
      description: "playerStyle.tacticalDescription",
      color: "pink",
    };
  }

  if (dinamico >= 26) {
    return {
      label: "playerStyle.dynamic",
      description: "playerStyle.dynamicDescription",
      color: "yellow",
    };
  }

  if (solido >= 24) {
    return {
      label: "playerStyle.solid",
      description: "playerStyle.solidDescription",
      color: "blue",
    };
  }

  // ---- Final fallback: map by primary axis ----
  const styleMap: Record<keyof StyleVector, PlayerStyleLabel> = {
    tactico: {
      label: "playerStyle.tactical",
      description: "playerStyle.tacticalFallbackDescription",
      color: "pink",
    },
    posicional: {
      label: "playerStyle.positional",
      description: "playerStyle.positionalFallbackDescription",
      color: "cyan",
    },
    solido: {
      label: "playerStyle.solid",
      description: "playerStyle.solidFallbackDescription",
      color: "blue",
    },
    gambitero: {
      label: "playerStyle.gambiteer",
      description: "playerStyle.gambiteerFallbackDescription",
      color: "violet",
    },
    offbeat: {
      label: "playerStyle.unconventional",
      description: "playerStyle.unconventionalFallbackDescription",
      color: "grape",
    },
    sistematico: {
      label: "playerStyle.systematic",
      description: "playerStyle.systematicFallbackDescription",
      color: "teal",
    },
    dinamico: {
      label: "playerStyle.dynamic",
      description: "playerStyle.dynamicFallbackDescription",
      color: "orange",
    },
    hipermoderno: {
      label: "playerStyle.hypermodernDynamic",
      description: "playerStyle.hypermodernDynamicDescription",
      color: "orange",
    },
  };

  return (
    styleMap[primaryKey] ?? {
      label: "playerStyle.mixedStyle",
      description: "playerStyle.mixedStyleDescription",
      color: "gray",
    }
  );
}
