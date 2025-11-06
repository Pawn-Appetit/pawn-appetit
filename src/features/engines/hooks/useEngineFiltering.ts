import { useMemo } from "react";
import type { SortState } from "@/components/GenericHeader";
import type { Engine } from "@/utils/engines";

export const createEngineSearchText = (engine: Engine): string => {
  const parts = [
    engine.name,
    engine.type === "local" ? engine.path : engine.url,
    engine.type === "local" ? (engine.version ?? "") : "",
  ];
  return parts.join(" ").toLowerCase();
};

export const sortEnginesByName = (a: Engine, b: Engine, direction: "asc" | "desc"): number => {
  const comparison = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  return direction === "asc" ? comparison : -comparison;
};

export const sortEnginesByElo = (a: Engine, b: Engine, direction: "asc" | "desc"): number => {
  const eloA = a.type === "local" ? (a.elo ?? -1) : -1;
  const eloB = b.type === "local" ? (b.elo ?? -1) : -1;
  const comparison = eloA - eloB;
  return direction === "asc" ? comparison : -comparison;
};

export const useEngineFiltering = (engines: Engine[], query: string, sortBy: SortState) => {
  return useMemo<number[]>(() => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      const result = engines
        .map((_, i) => i)
        .sort((a, b) => {
          const ea = engines[a];
          const eb = engines[b];
          return sortBy.field === "name"
            ? sortEnginesByName(ea, eb, sortBy.direction)
            : sortEnginesByElo(ea, eb, sortBy.direction);
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
      return sortBy.field === "name"
        ? sortEnginesByName(ea, eb, sortBy.direction)
        : sortEnginesByElo(ea, eb, sortBy.direction);
    });

    return result;
  }, [engines, query, sortBy]);
};
