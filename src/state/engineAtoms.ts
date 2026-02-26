// Engine management atoms: list, settings, best-move families, enable/disable.
import { parseUci } from "chessops";
import { INITIAL_FEN, makeFen } from "chessops/fen";
import equal from "fast-deep-equal";
import { atom } from "jotai";
import { atomFamily, atomWithStorage, loadable } from "jotai/utils";
import type { BestMoves, GoMode } from "@/bindings";
import { positionFromFen, swapMove } from "@/utils/chessops";
import { type Engine, type EngineSettings, engineSchema } from "@/utils/engines";
import { getWinChance, normalizeScore } from "@/utils/score";
import { createAsyncZodStorage, fileStorage, zodArray } from "./utils";
import { activeTabAtom } from "./uiAtoms";

// Engine list
export const enginesAtom = atomWithStorage<Engine[]>(
  "engines/engines.json",
  [],
  createAsyncZodStorage(zodArray(engineSchema), fileStorage),
);

export const loadableEnginesAtom = loadable(enginesAtom);

// CP / WDL display mode
export const reportTypeAtom = atom<"CP" | "WDL">("CP");
export const scoreTypeFamily = atomFamily((engine: string) => atom<"cp" | "wdl">("cp"));

// Per-engine-tab move/progress atoms
export const engineMovesFamily = atomFamily(
  ({ tab, engine }: { tab: string; engine: string }) => atom<Map<string, BestMoves[]>>(new Map()),
  (a, b) => a.tab === b.tab && a.engine === b.engine,
);

export const engineProgressFamily = atomFamily(
  ({ tab, engine }: { tab: string; engine: string }) => atom<number>(0),
  (a, b) => a.tab === b.tab && a.engine === b.engine,
);

// Per-engine-tab settings (enabled state, go mode, uci options)
export const tabEngineSettingsFamily = atomFamily(
  ({
    tab,
    engineName,
    defaultSettings,
    defaultGo,
  }: {
    tab: string;
    engineName: string;
    defaultSettings?: EngineSettings;
    defaultGo?: GoMode;
  }) => {
    return atom<{
      enabled: boolean;
      settings: EngineSettings;
      go: GoMode;
      synced: boolean;
    }>({
      enabled: false,
      settings: defaultSettings || [],
      go: defaultGo || { t: "Infinite" },
      synced: true,
    });
  },
  (a, b) => a.tab === b.tab && a.engineName === b.engineName,
);

// Aggregate enable/disable atoms
export const allEnabledAtom = loadable(
  atom(async (get) => {
    const engines = await get(enginesAtom);

    const v = engines
      .filter((e) => e.loaded)
      .every((engine) => {
        const a = tabEngineSettingsFamily({
          tab: get(activeTabAtom)!,
          engineName: engine.name,
          defaultSettings: engine.type === "local" ? engine.settings || [] : undefined,
          defaultGo: engine.go ?? undefined,
        });
        return get(a).enabled;
      });

    return v;
  }),
);

export const enableAllAtom = atom(null, (get, set, value: boolean) => {
  const engines = get(loadableEnginesAtom);
  if (!(engines.state === "hasData")) return;

  for (const engine of engines.data.filter((e) => e.loaded)) {
    const a = tabEngineSettingsFamily({
      tab: get(activeTabAtom)!,
      engineName: engine.name,
      defaultSettings: engine.type === "local" ? engine.settings || [] : undefined,
      defaultGo: engine.go ?? undefined,
    });
    set(a, { ...get(a), enabled: value });
  }
});

// Best moves derived atom (aggregates all engine outputs for a position)
/** Returns the best moves of each loaded engine for the given FEN + game moves. */
export const bestMovesFamily = atomFamily(
  ({ fen, gameMoves }: { fen: string; gameMoves: string[] }) =>
    atom<Map<number, { pv: string[]; winChance: number }[]>>((get) => {
      const tab = get(activeTabAtom);
      if (!tab) return new Map();
      const engines = get(loadableEnginesAtom);
      if (!(engines.state === "hasData")) return new Map();
      const bestMoves = new Map<number, { pv: string[]; winChance: number }[]>();
      let n = 0;
      for (const engine of engines.data.filter((e) => e.loaded)) {
        const engineMoves = get(engineMovesFamily({ tab, engine: engine.name }));
        const [pos] = positionFromFen(fen);
        let finalFen = INITIAL_FEN;
        if (pos) {
          for (const move of gameMoves) {
            const m = parseUci(move);
            pos.play(m!);
          }
          finalFen = makeFen(pos.toSetup());
        }
        const moves = engineMoves.get(`${swapMove(finalFen)}:`) || engineMoves.get(`${fen}:${gameMoves.join(",")}`);
        if (moves && moves.length > 0) {
          const bestWinChange = getWinChance(normalizeScore(moves[0].score.value, pos?.turn || "white"));
          bestMoves.set(
            n,
            moves.reduce<{ pv: string[]; winChance: number }[]>((acc, m) => {
              const winChance = getWinChance(normalizeScore(m.score.value, pos?.turn || "white"));
              if (bestWinChange - winChance < 10) {
                acc.push({ pv: m.uciMoves, winChance });
              }
              return acc;
            }, []),
          );
        }
        n++;
      }
      return bestMoves;
    }),
  (a, b) => a.fen === b.fen && equal(a.gameMoves, b.gameMoves),
);
