import { Alert, Group, ScrollArea, SegmentedControl, Stack, Tabs, Text } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtom, useAtomValue } from "jotai";
import { memo, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import { TreeStateContext } from "@/components/TreeStateContext";
import {
  currentDbTabAtom,
  currentDbTypeAtom,
  currentLocalOptionsAtom,
  currentTabAtom,
  lichessOptionsAtom,
  masterOptionsAtom,
  referenceDbAtom,
} from "@/state/atoms";
import { type NormalizedGame } from "@/bindings";
import { type Opening, searchPosition } from "@/utils/db";
import { convertToNormalized, getLichessGames, getMasterGames } from "@/utils/lichess/api";
import type { LichessGamesOptions, MasterGamesOptions } from "@/utils/lichess/explorer";
import DatabaseLoader from "./DatabaseLoader";
import GamesTable from "./GamesTable";
import NoDatabaseWarning from "./NoDatabaseWarning";
import OpeningsTable from "./OpeningsTable";
import LichessOptionsPanel from "./options/LichessOptionsPanel";
import LocalOptionsPanel from "./options/LocalOptionsPanel";
import MasterOptionsPanel from "./options/MastersOptionsPanel";

type OpeningData = { openings: Opening[]; games: NormalizedGame[] };

type DBType =
  | { type: "local"; options: LocalOptions }
  | { type: "lch_all"; options: LichessGamesOptions; fen: string }
  | { type: "lch_master"; options: MasterGamesOptions; fen: string };

export type LocalOptions = {
  path: string | null;
  fen: string;
  type: "exact" | "partial";
  player: number | null;
  color: "white" | "black";
  start_date?: string;
  end_date?: string;
  result: "any" | "whitewon" | "draw" | "blackwon";
  sort?: "id" | "date" | "whiteElo" | "blackElo" | "averageElo" | "ply_count";
  direction?: "asc" | "desc";
  gameDetailsLimit?: number;
};

function sortOpenings(openings: Opening[]) {
  return openings.sort((a, b) => b.black + b.draw + b.white - (a.black + a.draw + a.white));
}

async function fetchOpening(db: DBType, tab: string, gameDetailsLimit: number) {
  return match(db)
    .with({ type: "lch_all" }, async ({ fen, options }) => {
      const data = await getLichessGames(fen, options);
      return {
        openings: data.moves.map((move) => ({
          move: move.san,
          white: move.white,
          black: move.black,
          draw: move.draws,
        })),
        games: await convertToNormalized(data.topGames || data.recentGames || []),
      };
    })
    .with({ type: "lch_master" }, async ({ fen, options }) => {
      const data = await getMasterGames(fen, options);
      return {
        openings: data.moves.map((move) => ({
          move: move.san,
          white: move.white,
          black: move.black,
          draw: move.draws,
        })),
        games: await convertToNormalized(data.topGames || data.recentGames || []),
      };
    })
    .with({ type: "local" }, async ({ options }) => {
      if (!options.path) throw Error("Missing reference database");
      const positionData = await searchPosition({ ...options, gameDetailsLimit }, tab);
      return {
        openings: sortOpenings(positionData[0]),
        games: positionData[1],
      };
    })
    .exhaustive();
}

function DatabasePanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const store = useContext(TreeStateContext)!;
  const fen = useStore(store, (s) => s.currentNode().fen);
  const referenceDatabase = useAtomValue(referenceDbAtom);
  const [db, setDb] = useAtom(currentDbTypeAtom);
  // Reduced debounce for local DB to improve synchronization with analysis board
  const [debouncedFen] = useDebouncedValue(fen, db === "local" ? 100 : 50);
  const [lichessOptions] = useAtom(lichessOptionsAtom);
  const [masterOptions] = useAtom(masterOptionsAtom);
  const [localOptions, setLocalOptions] = useAtom(currentLocalOptionsAtom);
  const [gameLimit, setGameLimit] = useState(1000);
  const tab = useAtomValue(currentTabAtom);
  const [tabType, setTabType] = useAtom(currentDbTabAtom);
  const prevFenRef = useRef<string>(fen);
  const tabValue = tab?.value ?? "analysis";

  // Update localOptions immediately when FEN changes (before debounce)
  // This ensures the query always uses the latest FEN
  // Always load 1000 games sorted by elo when FEN changes
  useEffect(() => {
    if (db === "local") {
      const fenChanged = fen !== prevFenRef.current;
      if (fenChanged) {
        prevFenRef.current = fen;
        
        // Cancel any ongoing queries immediately when FEN changes
        queryClient.cancelQueries({ queryKey: ["database-opening"] });
        
        setLocalOptions((q) => {
          // Update FEN immediately and ensure sort is by averageElo
          const updated = q.fen !== fen 
            ? { ...q, fen, sort: "averageElo" as const, direction: "desc" as const }
            : { ...q, sort: "averageElo" as const, direction: "desc" as const };
          return updated;
        });
        
        // Always set limit to 1000 when FEN changes
        setGameLimit(1000);
      }
    }
  }, [fen, setLocalOptions, db, queryClient]);

  // Handle debounced FEN for final query invalidation
  // This ensures we don't trigger too many queries during rapid FEN changes
  useEffect(() => {
    if (db === "local" && debouncedFen === fen) {
      // Only invalidate when debounce settles and matches current FEN
      queryClient.invalidateQueries({ queryKey: ["database-opening"] });
    }
  }, [debouncedFen, fen, db, queryClient]);

  useEffect(() => {
    if (db === "local") {
      setLocalOptions((q) => ({ ...q, path: referenceDatabase }));
    }
  }, [referenceDatabase, setLocalOptions, db]);

  // Memoize dbType to avoid recreating on every render
  // IMPORTANT: Always use localOptions.fen (updated immediately) for local DB to ensure synchronization
  const dbType: DBType = useMemo(() => match(db)
    .with("local", (v) => ({
      type: v,
      options: localOptions, // localOptions.fen is updated immediately when FEN changes
    }))
    .with("lch_all", (v) => ({
      type: v,
      options: lichessOptions,
      fen: debouncedFen,
    }))
    .with("lch_master", (v) => ({
      type: v,
      options: masterOptions,
      fen: debouncedFen,
    }))
    .exhaustive(), [db, localOptions, lichessOptions, masterOptions, debouncedFen]);

  const queryEnabled = tabType !== "options"
    && (db !== "local" || (!!localOptions.fen && !!localOptions.path));

  const {
    data: openingData,
    isLoading,
    error,
  } = useQuery<OpeningData, Error, OpeningData, readonly unknown[]>({
    // Use localOptions.fen directly for queryKey to ensure it matches what's sent to backend
    queryKey: ["database-opening", db, 
      db === "local" ? localOptions.fen : debouncedFen, // include fen for all DBs to refetch on board move
      db === "local" ? localOptions.type : null,
      db === "local" ? localOptions.player : null,
      db === "local" ? localOptions.color : null,
      db === "local" ? localOptions.start_date : null,
      db === "local" ? localOptions.end_date : null,
      db === "local" ? localOptions.result : null,
      db === "local" ? localOptions.sort : null,
      db === "local" ? localOptions.direction : null,
      tabValue, gameLimit],
    queryFn: () => fetchOpening(dbType, tabValue, gameLimit) as Promise<OpeningData>,
    enabled: queryEnabled && (db !== "local" || !!localOptions.fen && !!localOptions.path),
    staleTime: 0, // Always refetch when FEN or parameters change to show latest results
    gcTime: 10000, // Keep in cache for 10 seconds (reduced from 30)
    refetchOnMount: true, // Refetch when component mounts to ensure fresh data
  });

  const grandTotal = openingData?.openings?.reduce(
    (acc: number, curr: Opening) => acc + curr.black + curr.white + curr.draw,
    0,
  );

  useEffect(() => {
    if (error) {
      console.error("[DatabasePanel] query error", {
        message: error.message,
        error: error,
        stack: error.stack,
        db,
        tab: tabValue,
        tabType,
        localFen: localOptions.fen,
        path: localOptions.path,
        gameLimit,
      });
    }
  }, [error, db, tab?.value, tabType, localOptions.fen, localOptions.path, gameLimit]);

  useEffect(() => {
    console.debug("[DatabasePanel] query params", {
      db,
      tab: tabValue,
      tabType,
      enabled: queryEnabled,
      fenLive: fen,
      fenDebounced: debouncedFen,
      localFen: localOptions.fen,
      localPath: localOptions.path,
      limit: gameLimit,
    });
  }, [db, tab?.value, tabType, queryEnabled, fen, debouncedFen, localOptions.fen, localOptions.path, gameLimit]);

  useEffect(() => {
    if (openingData) {
      console.debug("[DatabasePanel] query result", {
        openings: openingData.openings?.length ?? 0,
        games: openingData.games?.length ?? 0,
        sampleOpening: openingData.openings?.[0],
        sampleGame: openingData.games?.[0]?.id,
      });
    }
  }, [openingData]);

  return (
    <Stack h="100%" gap={0}>
      <Group justify="space-between" w="100%">
        <SegmentedControl
          data={[
            { label: t("features.board.database.local"), value: "local" },
            { label: t("features.board.database.lichessAll"), value: "lch_all" },
            { label: t("features.board.database.lichessMaster"), value: "lch_master" },
          ]}
          value={db}
          onChange={(value) => setDb(value as "local" | "lch_all" | "lch_master")}
        />

        {tabType !== "options" && (
          <Text>
            {t("features.board.database.matches", {
              matches: Math.max(grandTotal || 0, openingData?.games.length || 0),
            })}
          </Text>
        )}
      </Group>

      <DatabaseLoader isLoading={isLoading} tab={tab?.value ?? null} />

      <Tabs
        defaultValue="stats"
        orientation="vertical"
        placement="right"
        value={tabType}
        onChange={(v) => setTabType(v!)}
        display="flex"
        flex={1}
        style={{ overflow: "hidden" }}
      >
        <Tabs.List>
          <Tabs.Tab value="stats" disabled={dbType.type === "local" && dbType.options.type === "partial"}>
            {t("features.board.database.stats")}
          </Tabs.Tab>
          <Tabs.Tab value="games">{t("features.board.database.games")}</Tabs.Tab>
          <Tabs.Tab value="options">{t("features.board.database.options")}</Tabs.Tab>
        </Tabs.List>

        <PanelWithError value="stats" error={error} type={db}>
          <OpeningsTable openings={openingData?.openings || []} loading={isLoading} />
        </PanelWithError>
        <PanelWithError value="games" error={error} type={db}>
          <GamesTable games={openingData?.games || []} loading={isLoading} />
        </PanelWithError>
        <PanelWithError value="options" error={error} type={db}>
          <ScrollArea h="100%" offsetScrollbars>
            {match(db)
              .with("local", () => <LocalOptionsPanel boardFen={debouncedFen} />)
              .with("lch_all", () => <LichessOptionsPanel />)
              .with("lch_master", () => <MasterOptionsPanel />)
              .exhaustive()}
          </ScrollArea>
        </PanelWithError>
      </Tabs>
    </Stack>
  );
}

function PanelWithError(props: { value: string; error: Error | null; type: string; children: React.ReactNode }) {
  const referenceDatabase = useAtomValue(referenceDbAtom);
  let children = props.children;
  if (props.type === "local" && !referenceDatabase) {
    children = <NoDatabaseWarning />;
  }
  if (props.error && props.type !== "local") {
    children = <Alert color="red">{props.error.message}</Alert>;
  }

  return (
    <Tabs.Panel pt="xs" value={props.value} flex={1}>
      {children}
    </Tabs.Panel>
  );
}

export default memo(DatabasePanel);
