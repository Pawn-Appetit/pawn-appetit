import type { MantineColor } from "@mantine/core";

export type Annotation =
  | ""
  | "!"
  | "!!"
  | "?"
  | "??"
  | "!?"
  | "?!"
  | "+-"
  | "±"
  | "⩲"
  | "="
  | "∞"
  | "⩱"
  | "∓"
  | "-+"
  | "N"
  | "Best";

export const NAG_INFO = new Map<string, Annotation>([
  ["$1", "!"],
  ["$2", "?"],
  ["$3", "!!"],
  ["$4", "??"],
  ["$5", "!?"],
  ["$6", "?!"],
  ["$8", "Best"], // Best move (engine's best move, different from "!" which is good/great)
  ["$10", "="],
  ["$13", "∞"],
  ["$14", "⩲"],
  ["$15", "⩱"],
  ["$16", "±"],
  ["$17", "∓"],
  ["$18", "+-"],
  ["$19", "-+"],
  ["$146", "N"],
]);

type AnnotationInfo = {
  group?: string;
  name: string;
  translationKey?: string;
  color?: MantineColor;
  nag: number;
};

export const ANNOTATION_INFO: Record<Annotation, AnnotationInfo> = {
  "": { name: "None", translationKey: "none", color: "gray", nag: 0 },
  "!!": { group: "basic", name: "brilliant", translationKey: "brilliant", color: "cyan", nag: 3 },
  "!": { group: "basic", name: "great", translationKey: "great", color: "blue", nag: 1 },
  "!?": { group: "basic", name: "interesting", translationKey: "interesting", color: "lime", nag: 5 },
  "?!": { group: "basic", name: "dubious", translationKey: "dubious", color: "yellow", nag: 6 },
  "?": { group: "basic", name: "mistake", translationKey: "mistake", color: "orange", nag: 2 },
  "??": { group: "basic", name: "blunder", translationKey: "blunder", color: "red", nag: 4 },
  "+-": {
    group: "advantage",
    name: "White is winning",
    translationKey: "whiteWinning",
    nag: 18,
  },
  "±": {
    group: "advantage",
    name: "White has a clear advantage",
    translationKey: "whiteAdvantage",
    nag: 16,
  },
  "⩲": {
    group: "advantage",
    name: "White has a slight advantage",
    translationKey: "whiteEdge",
    nag: 14,
  },
  "=": {
    group: "advantage",
    name: "Equal position",
    translationKey: "equal",
    nag: 10,
  },
  "∞": {
    group: "advantage",
    name: "Unclear position",
    translationKey: "unclear",
    nag: 13,
  },
  "⩱": {
    group: "advantage",
    name: "Black has a slight advantage",
    translationKey: "blackEdge",
    nag: 15,
  },
  "∓": {
    group: "advantage",
    name: "Black has a clear advantage",
    translationKey: "blackAdvantage",
    nag: 17,
  },
  "-+": {
    group: "advantage",
    name: "Black is winning",
    translationKey: "blackWinning",
    nag: 19,
  },
  N: { name: "Novelty", translationKey: "novelty", nag: 146 },
  Best: { group: "basic", name: "Best", translationKey: "best", color: "green", nag: 8 },
};

export function isBasicAnnotation(annotation: string): annotation is "!" | "!!" | "?" | "??" | "!?" | "?!" | "Best" {
  return ["!", "!!", "?", "??", "!?", "?!", "Best"].includes(annotation);
}

/**
 * Central color map for move quality annotations in the analysis report.
 * These colors are used for visual display of annotations in the UI.
 */
export const annotationColors: Record<Annotation, string> = {
  "!!": "#06B6D4", // Brilliant - cyan
  "!": "#3B82F6", // Great / Good / Unique - blue
  Best: "#22C55E", // Best - green
  "!?": "#A855F7", // Interesting - purple
  "?!": "#FACC15", // Dubious - yellow
  "?": "#FB923C", // Mistake - orange
  "??": "#EF4444", // Blunder - red
  "": "#6B7280", // Neutral / no annotation - gray
  // Advantage annotations (keep existing colors or use neutral)
  "+-": "#6B7280",
  "±": "#6B7280",
  "⩲": "#6B7280",
  "=": "#6B7280",
  "∞": "#6B7280",
  "⩱": "#6B7280",
  "∓": "#6B7280",
  "-+": "#6B7280",
  // Other annotations
  N: "#6B7280",
};
