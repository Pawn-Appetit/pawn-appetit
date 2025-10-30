import { ActionIcon, Paper, Stack, Tabs, Text, useMantineTheme } from "@mantine/core";
import { useForceUpdate } from "@mantine/hooks";
import { IconEye } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { DataTable, type DataTableSortStatus } from "mantine-datatable";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { match } from "ts-pattern";
import { useStore } from "zustand";
import type { Event, NormalizedGame } from "@/bindings";
import { useLanguageChangeListener } from "@/hooks/useLanguageChangeListener";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import type { DatabaseViewStore } from "@/state/store/database";
import { getTournamentGames } from "@/utils/db";
import { parseDate } from "@/utils/format";
import { createTab } from "@/utils/tabs";
import { DatabaseViewStateContext } from "./DatabaseViewStateContext";

const gamePoints = (game: NormalizedGame, player: string) => {
  if (game.white === player) {
    return match(game.result)
      .with("1-0", () => 1)
      .with("0-1", () => 0)
      .with("1/2-1/2", () => 0.5)
      .otherwise(() => 0);
  }
  return match(game.result)
    .with("1-0", () => 0)
    .with("0-1", () => 1)
    .with("1/2-1/2", () => 0.5)
    .otherwise(() => 0);
};

function TournamentCard({ tournament, file }: { tournament: Event; file: string }) {
  const { t } = useTranslation();
  const store = useContext(DatabaseViewStateContext)!;
  const tournamentsActiveTab = useStore(store, (s) => s.tournaments.activeTab);
  const setTournamentsActiveTab = useStore(store, (s) => s.setTournamentsActiveTab);
  const theme = useMantineTheme();
  const navigate = useNavigate();
  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const forceUpdate = useForceUpdate();
  useLanguageChangeListener(forceUpdate);

  const { data: games, isLoading } = useQuery({
    queryKey: ["tournament-games", file, tournament.id],
    queryFn: async () => {
      const games = await getTournamentGames(file, tournament.id);
      return games.data;
    },
    staleTime: Infinity,
  });

  const [sort, setSort] = useState<DataTableSortStatus<NormalizedGame>>({
    columnAccessor: "date",
    direction: "asc",
  });

  const sortedGames =
    games?.sort((a, b) => {
      const key = sort.columnAccessor;
      if (sort.direction === "asc") {
        /// @ts-expect-error we know they're the same type
        return a[key] > b[key] ? 1 : -1;
      }
      /// @ts-expect-error we know they're the same type
      return a[key] < b[key] ? 1 : -1;
    }) || [];

  const players =
    games?.reduce(
      (acc, game) => {
        const whitePlayer = acc.find((p) => p.name === game.white);
        const blackPlayer = acc.find((p) => p.name === game.black);
        if (!whitePlayer) {
          acc.push({
            name: game.white,
            points: gamePoints(game, game.white),
          });
        } else {
          whitePlayer.points += gamePoints(game, game.white);
        }

        if (!blackPlayer) {
          acc.push({
            name: game.black,
            points: gamePoints(game, game.black),
          });
        } else {
          blackPlayer.points += gamePoints(game, game.black);
        }

        return acc;
      },
      [] as { name: string; points: number }[],
    ) || [];

  players.sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const paginatedGames = sortedGames.slice((page - 1) * 25, (page - 1) * 25 + 25);

  return (
    <Paper shadow="sm" p="sm" withBorder h="100%">
      <Stack h="100%">
        <Text fz="lg" fw={500}>
          {tournament.name}
        </Text>
        <Tabs
          defaultValue="games"
          value={tournamentsActiveTab}
          onChange={(tab) => setTournamentsActiveTab(tab as DatabaseViewStore["tournaments"]["activeTab"])}
          style={{ flexDirection: "column", overflow: "hidden" }}
          display="flex"
          h="100%"
        >
          <Tabs.List>
            <Tabs.Tab value="games">Games</Tabs.Tab>
            <Tabs.Tab value="leaderboard">Leaderboard</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="games" flex={1} style={{ overflow: "hidden" }}>
            <DataTable<NormalizedGame>
              fetching={isLoading}
              withTableBorder
              highlightOnHover
              records={paginatedGames}
              totalRecords={sortedGames.length}
              recordsPerPage={pageSize}
              onRecordsPerPageChange={setPageSize}
              recordsPerPageOptions={[10, 25, 50]}
              page={page}
              onPageChange={setPage}
              sortStatus={sort}
              onSortStatusChange={setSort}
              columns={[
                {
                  accessor: "actions",
                  title: "",
                  render: (game) => (
                    <ActionIcon
                      variant="filled"
                      color={theme.primaryColor}
                      onClick={() => {
                        createTab({
                          tab: {
                            name: `${game.white} - ${game.black}`,
                            type: "analysis",
                          },
                          setTabs,
                          setActiveTab,
                          pgn: game.moves,
                          headers: game,
                          srcInfo: {
                            type: "db",
                            db: file,
                            id: game.id,
                          },
                        });
                        navigate({ to: "/boards" });
                      }}
                    >
                      <IconEye size="1rem" stroke={1.5} />
                    </ActionIcon>
                  ),
                },
                {
                  accessor: "white",
                  render: ({ white, white_elo }) => (
                    <div>
                      <Text size="sm" fw={500}>
                        {white}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {white_elo}
                      </Text>
                    </div>
                  ),
                },
                {
                  accessor: "black",
                  render: ({ black, black_elo }) => (
                    <div>
                      <Text size="sm" fw={500}>
                        {black}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {black_elo}
                      </Text>
                    </div>
                  ),
                },
                {
                  accessor: "date",
                  sortable: true,
                  render: ({ date }) =>
                    t("formatters.dateFormat", { date: parseDate(date), interpolation: { escapeValue: false } }),
                },
                { accessor: "result" },
                { accessor: "ply_count", sortable: true },
              ]}
              noRecordsText="No games found"
            />
          </Tabs.Panel>
          <Tabs.Panel value="leaderboard" flex={1} style={{ overflow: "hidden" }}>
            <DataTable
              fetching={isLoading}
              withTableBorder
              highlightOnHover
              records={players}
              columns={[
                {
                  accessor: "rank",
                  title: "#",
                  width: "2.5rem",
                  render: (_player, index) => (
                    <Text size="sm" fw={500}>
                      {index + 1}
                    </Text>
                  ),
                },
                {
                  accessor: "name",
                  title: "Player",
                  render: (player) => (
                    <Text size="sm" fw={500}>
                      {player.name}
                    </Text>
                  ),
                },
                {
                  accessor: "points",
                  title: "Points",
                  render: (player) => (
                    <Text size="sm" fw={500}>
                      {player.points}
                    </Text>
                  ),
                },
              ]}
              noRecordsText="No players found"
            />
          </Tabs.Panel>
        </Tabs>
      </Stack>
    </Paper>
  );
}

export default TournamentCard;
