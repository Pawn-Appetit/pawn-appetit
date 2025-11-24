import { ActionIcon, Text, useMantineTheme } from "@mantine/core";
import { useForceUpdate } from "@mantine/hooks";
import { IconEye } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useSetAtom } from "jotai";
import { DataTable } from "mantine-datatable";
import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NormalizedGame } from "@/bindings";
import { useLanguageChangeListener } from "@/hooks/useLanguageChangeListener";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { parseDate } from "@/utils/format";
import { createTab } from "@/utils/tabs";

type GameWithAverageElo = NormalizedGame & { averageElo: number | null };

function GamesTable({ games, loading }: { games: NormalizedGame[]; loading: boolean }) {
  const { t } = useTranslation();
  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const forceUpdate = useForceUpdate();
  useLanguageChangeListener(forceUpdate);

  const theme = useMantineTheme();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Calculate average ELO for each game (for display only, sorting is done in backend)
  const gamesWithAverageElo = useMemo<GameWithAverageElo[]>(
    () =>
      games.map((game) => {
        const whiteElo = game.white_elo ?? null;
        const blackElo = game.black_elo ?? null;
        let averageElo: number | null = null;

        if (whiteElo !== null && blackElo !== null) {
          averageElo = Math.round((whiteElo + blackElo) / 2);
        } else if (whiteElo !== null) {
          averageElo = whiteElo;
        } else if (blackElo !== null) {
          averageElo = blackElo;
        }

        return { ...game, averageElo };
      }),
    [games],
  );

  // Paginate games (games are already sorted by backend)
  const paginatedGames = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return gamesWithAverageElo.slice(start, end);
  }, [gamesWithAverageElo, page, pageSize]);

  return (
    <DataTable
      withTableBorder
      highlightOnHover
      records={paginatedGames}
      fetching={loading}
      page={page}
      onPageChange={setPage}
      totalRecords={gamesWithAverageElo.length}
      recordsPerPage={pageSize}
      onRecordsPerPageChange={setPageSize}
      recordsPerPageOptions={[10, 25, 50, 100]}
      columns={[
        {
          accessor: "actions",
          title: "",
          render: (game) => (
            <ActionIcon
              variant="subtle"
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
          accessor: "averageElo",
          title: "ELO Promedio",
          render: ({ averageElo }) => <Text fw={500}>{averageElo ?? "-"}</Text>,
        },
        {
          accessor: "date",
          render: ({ date }) =>
            t("formatters.dateFormat", { date: parseDate(date), interpolation: { escapeValue: false } }),
        },
        { accessor: "result" },
        { accessor: "ply_count" },
      ]}
      noRecordsText="No games found"
    />
  );
}

export default memo(GamesTable);
