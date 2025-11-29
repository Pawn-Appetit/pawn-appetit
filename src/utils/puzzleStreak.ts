type SolvesMap = Record<string, number>;

const STORAGE_KEY = "pawn-appetit.puzzle.solves";

function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

function dateKey(d = new Date()): string {
  const year = d.getFullYear();
  const month = pad2(d.getMonth() + 1);
  const day = pad2(d.getDate());
  return `${year}-${month}-${day}`;
}

function addDays(d: Date, delta: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + delta);
  return copy;
}

function readSolves(): SolvesMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed as SolvesMap;
  } catch {
    // ignore parse errors
  }
  return {};
}

function writeSolves(solves: SolvesMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(solves));
  } catch {
    // ignore write errors (e.g., quota)
  }
}

export function recordPuzzleSolved(at: Date = new Date()) {
  const solves = readSolves();
  const key = dateKey(at);
  solves[key] = (solves[key] ?? 0) + 1;
  writeSolves(solves);
  try {
    window.dispatchEvent(new Event("puzzles:updated"));
  } catch {
    // noop for non-browser env
  }
}

export function getPuzzleStats(options?: { days?: number; target?: number }) {
  const days = options?.days ?? 7;
  const target = options?.target ?? 30;
  const solves = readSolves();

  let currentStreak = 0;
  for (let i = 0; ; i++) {
    const key = dateKey(addDays(new Date(), -i));
    const solved = (solves[key] ?? 0) > 0;
    if (solved) currentStreak++;
    else if (i > 0) break;
  }

  const history: { day: string; solved: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(new Date(), -i);
    const key = dateKey(d);
    const day = d.toLocaleDateString("en-US", { weekday: "short" });
    history.push({ day, solved: solves[key] ?? 0 });
  }

  return { currentStreak, target, history };
}

export type PuzzleStats = ReturnType<typeof getPuzzleStats>;

export function getTodayPuzzleCount(d: Date = new Date()): number {
  const solves = readSolves();
  const key = dateKey(d);
  return solves[key] ?? 0;
}
