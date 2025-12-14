/**
 * Types for player style analysis.
 */

export type StyleVector = {
  tactico: number;
  posicional: number;
  solido: number;
  gambitero: number;
  offbeat: number;
  sistematico: number;
  dinamico: number;
  hipermoderno: number;
};

export type PlayerStyleLabel = {
  label: string;
  description: string;
  color: string;
};

export type OpeningCharacteristics = {
  isGambit: boolean;
  isPositional: boolean;
  isTactical: boolean;
  isHypermodern: boolean;
  isSolid: boolean;
  isSystematic: boolean;
  isOffbeat: boolean;
  isDynamic: boolean;
};
