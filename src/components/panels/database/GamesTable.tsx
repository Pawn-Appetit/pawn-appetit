import {
  ActionIcon,
  Box,
  Group,
  Pagination,
  Select,
  Stack,
  Text,
  UnstyledButton,
  useMantineTheme,
} from "@mantine/core";
import { useForceUpdate } from "@mantine/hooks";
import { IconEye, IconLayoutGrid, IconList } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { DataTable } from "mantine-datatable";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NormalizedGame } from "@/bindings";
import MiniBoard from "@/components/MiniBoard";
import { useLanguageChangeListener } from "@/hooks/useLanguageChangeListener";
import {
  activeTabAtom,
  currentLocalOptionsAtom,
  seedLocalOptionsAtom,
  tabsAtom,
} from "@/state/atoms";
import { parseDate } from "@/utils/format";
import { createTab } from "@/utils/tabs";

type GameWithAverageElo = NormalizedGame & { averageElo: number | null };

function GamesTable({
  games,
  loading,
  totalMatches,
  asBoards,
}: {
  games: NormalizedGame[];
  loading: boolean;
  /** Games that matched overall; `games` is capped well below this. */
  totalMatches?: number;
  /**
   * Offer the board grid, and start on it.
   *
   * Only worth it for partial searches: an exact one matches the same
   * position in every game, so the grid would be one picture repeated.
   * The reader can still switch to the row list, which carries details the
   * boards have no room for.
   */
  asBoards?: boolean;
}) {
  const { t } = useTranslation();
  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const localOptions = useAtomValue(currentLocalOptionsAtom);
  const seedLocalOptions = useSetAtom(seedLocalOptionsAtom);
  const forceUpdate = useForceUpdate();
  useLanguageChangeListener(forceUpdate);

  const theme = useMantineTheme();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  /** Board-grid page size; null means "however many fit". */
  const [boardPageSize, setBoardPageSize] = useState<number | null>(null);
  /** Which of the two result views is showing, when both are on offer. */
  const [view, setView] = useState<"boards" | "rows">("boards");

  const showBoards = asBoards === true && view === "boards";

  const gridRef = useRef<HTMLDivElement>(null);
  const [gridBox, setGridBox] = useState({ width: 0, height: 0 });

  // Re-run on `asBoards`: the grid only exists for board mode, so a table
  // rendered first leaves nothing to observe, and without this the grid would
  // later appear with no observer at all — stuck at its fallback size and
  // deaf to the panel being resized.
  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;

    // Dragging a panel divider resizes continuously; without coalescing that
    // is a state update, and a re-layout of every board, on each frame.
    let frame = 0;
    const observer = new ResizeObserver(() => {
      // clientWidth, not entry.contentRect: contentRect does not subtract the
      // scrollbar gutter, so it overstates the usable width by ~14px and the
      // grid gets sized to overflow by exactly that.
      const { clientWidth, clientHeight } = element;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setGridBox({ width: clientWidth, height: clientHeight }));
    });
    observer.observe(element);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [showBoards]);

  // Smallest a board can get before the pieces stop being readable, and the
  // largest it is worth growing to when only a handful of games matched.
  const MIN_CELL = 96;
  const MAX_CELL = 260;
  const GAP = 8;
  /** Room the player names take under each board. */
  const LABEL = 16;

  // Fill the visible area rather than guessing a count: work out how many
  // columns fit at the minimum cell width, then how many such rows fit.
  const autoBoardPageSize = useMemo(() => {
    if (gridBox.width < MIN_CELL || gridBox.height < MIN_CELL) return 24;
    const columns = Math.max(1, Math.floor((gridBox.width + GAP) / (MIN_CELL + GAP)));
    const cellWidth = (gridBox.width - GAP * (columns - 1)) / columns;
    const rows = Math.max(1, Math.floor((gridBox.height + GAP) / (cellWidth + LABEL + GAP)));
    return columns * rows;
  }, [gridBox]);

  const effectivePageSize = showBoards ? (boardPageSize ?? autoBoardPageSize) : pageSize;

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
    const start = (page - 1) * effectivePageSize;
    const end = start + effectivePageSize;
    return gamesWithAverageElo.slice(start, end);
  }, [gamesWithAverageElo, page, effectivePageSize]);

  /**
   * The biggest square cell that still fits this page's boards in the panel.
   *
   * A page holding fewer boards than the panel could take — the usual case
   * once a query is narrow enough to be interesting — would otherwise leave
   * most of the space blank. Every column count is tried and the one giving
   * the largest cell wins, since the best split depends on the panel's
   * proportions as much as on the number of games.
   *
   * Returns null when the boards cannot grow past their minimum, leaving the
   * plain auto-fill packing to lay them out and scroll.
   */
  const boardLayout = useMemo(() => {
    const count = paginatedGames.length;
    if (!count || gridBox.width < MIN_CELL || gridBox.height < MIN_CELL) return null;

    let best: { columns: number; cell: number } | null = null;
    for (let columns = 1; columns <= count; columns++) {
      const rows = Math.ceil(count / columns);
      const cellWidth = (gridBox.width - GAP * (columns - 1)) / columns;
      const cellHeight = (gridBox.height - GAP * (rows - 1)) / rows - LABEL;
      // Floored: a fractional cell can round up in layout and push the last
      // column past the container, which brings the scrollbar back.
      const cell = Math.floor(Math.min(cellWidth, cellHeight));
      if (!best || cell > best.cell) best = { columns, cell };
    }

    if (!best || best.cell <= MIN_CELL) return null;
    return { columns: best.columns, cell: Math.min(best.cell, MAX_CELL) };
  }, [paginatedGames.length, gridBox]);

  const openGame = useCallback(
    async (game: NormalizedGame) => {
      const id = await createTab({
        tab: {
          name: `${game.white} - ${game.black}`,
          type: "analysis",
        },
        setTabs,
        setActiveTab,
        pgn: game.moves,
        headers: game,
        // Open at the move the search matched, rather than at move one. The
        // tree path to a main-line ply is that many zeroes.
        position:
          game.match_ply != null && game.match_ply > 0
            ? Array.from({ length: game.match_ply }, () => 0)
            : undefined,
      });
      // Carry the query across, so coming back from the game still has it.
      seedLocalOptions({ tab: id, options: localOptions });
      navigate({ to: "/boards" });
    },
    [setTabs, setActiveTab, navigate, seedLocalOptions, localOptions],
  );

  const truncated = totalMatches != null && totalMatches > games.length;

  return (
    <Stack gap="xs" h="100%">
      {(truncated || asBoards) && (
        <Group justify="space-between" gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed" lineClamp={1}>
            {truncated
              ? t("features.board.database.showingSubset", {
                  shown: games.length,
                  total: totalMatches,
                })
              : null}
          </Text>
          {asBoards && (
            <Group gap={4} wrap="nowrap">
              {/* Boards show where each game matched; the list shows players,
                  ratings and dates. Neither subsumes the other. */}
              <ActionIcon
                variant={view === "boards" ? "filled" : "subtle"}
                size="sm"
                aria-label={t("features.board.database.viewBoards")}
                title={t("features.board.database.viewBoards")}
                onClick={() => {
                  setView("boards");
                  // Page sizes differ between the views, so the current page
                  // number rarely points at the same games in the other.
                  setPage(1);
                }}
              >
                <IconLayoutGrid size="1rem" />
              </ActionIcon>
              <ActionIcon
                variant={view === "rows" ? "filled" : "subtle"}
                size="sm"
                aria-label={t("features.board.database.viewList")}
                title={t("features.board.database.viewList")}
                onClick={() => {
                  setView("rows");
                  setPage(1);
                }}
              >
                <IconList size="1rem" />
              </ActionIcon>
            </Group>
          )}
        </Group>
      )}
      {showBoards ? (
        <>
          {/* The measured element and the one the grid is laid out in have to
              be the same. A scrollbar takes its width from the inner box only,
              so sizing cells against an outer box overflows by exactly that
              much; measuring inside a scroller instead makes the measurement
              chase its own output. Scrolling therefore happens here, on the
              element the observer watches, with the gutter always reserved. */}
          <Box
            ref={gridRef}
            style={{
              flex: 1,
              minHeight: 0,
              // A grid of fixed-pixel columns has a min-content width equal to
              // their sum, and a flex item refuses to shrink below that — so
              // without this the grid widens its own ancestors, is measured
              // against the inflated width, and confirms itself into a stable
              // too-wide state that clips the whole panel, footer included.
              minWidth: 0,
              overflowY: "auto",
              overflowX: "hidden",
              // Space for the scrollbar is always held, so the content box is
              // the same width whether or not one is showing. Without this the
              // width still changes when the bar appears, and the measurement
              // chases itself again.
              scrollbarGutter: "stable",
            }}
          >
            {!loading && games.length === 0 ? (
              // The row list has mantine-datatable's own empty text; the grid
              // would otherwise just be a blank panel.
              <Text c="dimmed" ta="center" mt="xl">
                {t("features.board.database.noGames")}
              </Text>
            ) : null}
            <Box
              style={{
                display: "grid",
                // A measured column count when the boards can be grown;
                // otherwise auto-fill against the real container width, since
                // viewport breakpoints get this wrong inside a side panel.
                gridTemplateColumns: boardLayout
                  ? `repeat(${boardLayout.columns}, ${boardLayout.cell}px)`
                  : `repeat(auto-fill, minmax(${MIN_CELL}px, 1fr))`,
                // Grown cells are capped, so centre the leftover rather than
                // leaving it all on one side.
                justifyContent: boardLayout ? "center" : "stretch",
                // Literal, not a spacing token: the column maths subtracts GAP
                // per gutter, and --mantine-spacing-xs is 10px, not 8.
                gap: `${GAP}px`,
              }}
            >
              {paginatedGames.map((game) => (
                <UnstyledButton
                  key={game.id}
                  onClick={() => openGame(game)}
                  title={`${game.white} - ${game.black}`}
                >
                  <Stack gap={2}>
                    {game.match_fen ? (
                      <MiniBoard fen={game.match_fen} move={game.match_next_move} />
                    ) : null}
                    <Text size="10px" c="dimmed" lineClamp={1} ta="center">
                      {game.white} - {game.black}
                    </Text>
                  </Stack>
                </UnstyledButton>
              ))}
            </Box>
          </Box>
          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {(page - 1) * effectivePageSize + 1} -{" "}
              {Math.min(page * effectivePageSize, games.length)} / {games.length}
            </Text>
            <Group gap="xs">
              <Select
                size="xs"
                w={80}
                value={boardPageSize === null ? "auto" : String(boardPageSize)}
                data={[
                  { value: "auto", label: t("features.board.database.fitToPage") },
                  ...[24, 48, 96].map((n) => ({ value: String(n), label: String(n) })),
                ]}
                onChange={(value) => {
                  setBoardPageSize(value === null || value === "auto" ? null : Number(value));
                  setPage(1);
                }}
                allowDeselect={false}
              />
              <Pagination
                size="sm"
                value={page}
                onChange={setPage}
                total={Math.max(1, Math.ceil(games.length / effectivePageSize))}
              />
            </Group>
          </Group>
        </>
      ) : (
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
          onRowClick={({ record }) => openGame(record)}
          columns={[
            {
              accessor: "actions",
              title: "",
              render: (game) => (
                <ActionIcon
                  variant="subtle"
                  color={theme.primaryColor}
                  onClick={(event) => {
                    // The row opens the game too; without this the click would
                    // reach both handlers and open two tabs.
                    event.stopPropagation();
                    openGame(game);
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
                t("formatters.dateFormat", {
                  date: parseDate(date),
                  interpolation: { escapeValue: false },
                }),
            },
            { accessor: "result" },
            { accessor: "ply_count" },
          ]}
          noRecordsText="No games found"
        />
      )}
    </Stack>
  );
}

export default memo(GamesTable);
