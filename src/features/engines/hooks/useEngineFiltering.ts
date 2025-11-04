import { useMemo } from "react";
import type { Engine } from "@/utils/engines";

export const createEngineSearchText = (engine: Engine): string => {
  const parts = [
    engine.name,
    engine.type === "local" ? engine.path : engine.url,
    engine.type === "local" ? (engine.version ?? "") : "",
  ];
  return parts.join(" ").toLowerCase();
};

export const sortEnginesByName = (a: Engine, b: Engine): number =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase());

export const sortEnginesByElo = (a: Engine, b: Engine): number => {
  const eloA = a.type === "local" ? (a.elo ?? -1) : -1;
  const eloB = b.type === "local" ? (b.elo ?? -1) : -1;
  return eloB - eloA;
};

export const useEngineFiltering = (engines: Engine[], query: string, sortBy: "name" | "elo") => {
  return useMemo<number[]>(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      const result = engines
        .map((_, i) => i)
        .sort((a, b) => {
          const ea = engines[a];
          const eb = engines[b];
          return sortBy === "name" ? sortEnginesByName(ea, eb) : sortEnginesByElo(ea, eb);
        });

      return result;
    }

    const queryLower = trimmedQuery.toLowerCase();

    const searchableEngines = engines.map((e, i) => ({
      index: i,
      searchText: createEngineSearchText(e),
    }));

    const filteredIndices = searchableEngines
      .filter(({ searchText }) => searchText.includes(queryLower))
      .map(({ index }) => index);

    const result = filteredIndices.sort((a, b) => {
      const ea = engines[a];
      const eb = engines[b];
      return sortBy === "name" ? sortEnginesByName(ea, eb) : sortEnginesByElo(ea, eb);
    });

    return result;
  }, [engines, query, sortBy]);
};
