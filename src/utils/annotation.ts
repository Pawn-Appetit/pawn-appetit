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
  | "↑↑"
  | "↑"
  | "→"
  | "⇆"
  | "=∞"
  | "⊕"
  | "∆"
  | "□"
  | "⨀";

export const NAG_INFO = new Map<string, Annotation>([
  ["$1", "!"],
  ["$2", "?"],
  ["$3", "!!"],
  ["$4", "??"],
  ["$5", "!?"],
  ["$6", "?!"],
  ["$7", "□"],
  ["$10", "="],
  ["$13", "∞"],
  ["$14", "⩲"],
  ["$15", "⩱"],
  ["$16", "±"],
  ["$17", "∓"],
  ["$18", "+-"],
  ["$19", "-+"],
  ["$22", "⨀"],
  ["$23", "⨀"],
  ["$32", "↑↑"],
  ["$33", "↑↑"],
  ["$36", "↑"],
  ["$37", "↑"],
  ["$40", "→"],
  ["$41", "→"],
  ["$44", "=∞"],
  ["$45", "=∞"],
  ["$132", "⇆"],
  ["$133", "⇆"],
  ["$138", "⊕"],
  ["$139", "⊕"],
  ["$140", "∆"],
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
  "!": { group: "basic", name: "good", translationKey: "good", color: "teal", nag: 1 },
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
  "↑↑": { name: "Development", translationKey: "development", nag: 32 },
  "↑": { name: "Initiative", translationKey: "initiative", nag: 36 },
  "→": { name: "Attack", translationKey: "attack", nag: 40 },
  "⇆": { name: "Counterplay", translationKey: "counterplay", nag: 132 },
  "=∞": {
    name: "With compensation",
    translationKey: "withCompensation",
    nag: 44,
  },
  "⊕": { name: "Time Trouble", translationKey: "timeTrouble", nag: 138 },
  "∆": { name: "With the idea", translationKey: "withIdea", nag: 140 },
  "□": { name: "Only move", translationKey: "onlyMove", nag: 7 },
  "⨀": { name: "Zugzwang", translationKey: "zugzwang", nag: 22 },
};

export function isBasicAnnotation(annotation: string): annotation is "!" | "!!" | "?" | "??" | "!?" | "?!" {
  return ["!", "!!", "?", "??", "!?", "?!"].includes(annotation);
}
