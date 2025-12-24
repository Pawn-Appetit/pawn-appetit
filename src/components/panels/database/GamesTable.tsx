import { ActionIcon, Button, Checkbox, Group, Stack, Text, useMantineTheme } from "@mantine/core";
import { useForceUpdate } from "@mantine/hooks";
import { IconDownload, IconEye } from "@tabler/icons-react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { DataTable } from "mantine-datatable";
import { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { commands } from "@/bindings";
import type { NormalizedGame } from "@/bindings";
import { useLanguageChangeListener } from "@/hooks/useLanguageChangeListener";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { parseDate } from "@/utils/format";
import { createTab } from "@/utils/tabs";

type GameWithAverageElo = NormalizedGame & { averageElo: number | null };

function GamesTable({ 
  games, 
  loading,
  fen,
  databasePath,
}: { 
  games: NormalizedGame[]; 
  loading: boolean;
  fen?: string;
  databasePath?: string;
}) {
  const { t } = useTranslation();
  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const currentActiveTab = useAtomValue(activeTabAtom);
  const forceUpdate = useForceUpdate();
  useLanguageChangeListener(forceUpdate);

  const theme = useMantineTheme();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [exporting, setExporting] = useState(false);
  const [selectedGameIds, setSelectedGameIds] = useState<Set<number>>(new Set());

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

  // Check if all visible games are selected
  const allVisibleSelected = useMemo(() => {
    if (paginatedGames.length === 0) return false;
    return paginatedGames.every((game) => selectedGameIds.has(game.id));
  }, [paginatedGames, selectedGameIds]);

  // Check if some visible games are selected
  const someVisibleSelected = useMemo(() => {
    return paginatedGames.some((game) => selectedGameIds.has(game.id));
  }, [paginatedGames, selectedGameIds]);

  const handleToggleSelectAll = () => {
    if (allVisibleSelected) {
      // Deselect all visible games
      const newSelected = new Set(selectedGameIds);
      paginatedGames.forEach((game) => newSelected.delete(game.id));
      setSelectedGameIds(newSelected);
    } else {
      // Select all visible games
      const newSelected = new Set(selectedGameIds);
      paginatedGames.forEach((game) => newSelected.add(game.id));
      setSelectedGameIds(newSelected);
    }
  };

  const handleToggleSelect = (gameId: number) => {
    const newSelected = new Set(selectedGameIds);
    if (newSelected.has(gameId)) {
      newSelected.delete(gameId);
    } else {
      newSelected.add(gameId);
    }
    setSelectedGameIds(newSelected);
  };

  const handleOpenSelected = async () => {
    const selectedGames = games.filter((game) => selectedGameIds.has(game.id));
    const savedActiveTab = currentActiveTab;
    
    // Create all tabs (they will change active tab, but we'll restore it)
    for (const game of selectedGames) {
      await createTab({
        tab: {
          name: `${game.white} - ${game.black}`,
          type: "analysis",
        },
        setTabs,
        setActiveTab,
        pgn: game.moves,
        headers: game,
      });
    }
    
    // Restore the original active tab after all tabs are created
    if (savedActiveTab) {
      // Use requestAnimationFrame to ensure all state updates are complete
      requestAnimationFrame(() => {
        setActiveTab(savedActiveTab);
      });
    }
  };

  const handleExportPGN = async () => {
    if (!fen || !databasePath || games.length === 0) return;
    
    setExporting(true);
    try {
      // Create filename from FEN (replace spaces and special chars, limit length)
      const fenFilename = fen
        .replace(/\s+/g, "-")
        .replace(/[^a-zA-Z0-9-]/g, "")
        .substring(0, 50);
      
      const destFile = await save({
        filters: [{ name: "PGN", extensions: ["pgn"] }],
        defaultPath: `${fenFilename}.pgn`,
      });
      
      if (!destFile) {
        setExporting(false);
        return;
      }
      
      const result = await commands.exportPositionGamesToPgn(databasePath, fen, destFile);
      if (result.status === "error") {
        console.error("Failed to export games:", result.error);
      }
    } catch (error) {
      console.error("Error exporting games:", error);
    } finally {
      setExporting(false);
    }
  };

  const handleExportSelected = async () => {
    if (!databasePath || selectedGameIds.size === 0) return;
    
    setExporting(true);
    try {
      const destFile = await save({
        filters: [{ name: "PGN", extensions: ["pgn"] }],
        defaultPath: `selected-games-${selectedGameIds.size}.pgn`,
      });
      
      if (!destFile) {
        setExporting(false);
        return;
      }
      
      const gameIdsArray = Array.from(selectedGameIds);
      const result = await commands.exportSelectedGamesToPgn(databasePath, gameIdsArray, destFile);
      if (result.status === "error") {
        console.error("Failed to export selected games:", result.error);
      }
    } catch (error) {
      console.error("Error exporting selected games:", error);
    } finally {
      setExporting(false);
    }
  };

  const showExportButton = games.length > 0 && fen && databasePath;
  const selectedCount = selectedGameIds.size;

  return (
    <Stack gap={0} style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflow: "auto" }}>
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
              accessor: "select",
              title: (
                <Group gap="xs">
                  <Checkbox
                    checked={allVisibleSelected}
                    indeterminate={someVisibleSelected && !allVisibleSelected}
                    onChange={handleToggleSelectAll}
                    size="xs"
                  />
                  <ActionIcon
                    variant="subtle"
                    color={theme.primaryColor}
                    onClick={handleOpenSelected}
                    disabled={selectedCount === 0}
                    size="sm"
                  >
                    <IconEye size="1rem" stroke={1.5} />
                  </ActionIcon>
                </Group>
              ),
              width: 80,
              render: (game) => (
                <Checkbox
                  checked={selectedGameIds.has(game.id)}
                  onChange={() => handleToggleSelect(game.id)}
                  size="xs"
                />
              ),
            },
            {
              accessor: "actions",
              title: "",
              width: 40,
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
      </div>
      {showExportButton && (
        <Group justify="flex-end" p="xs" style={{ borderTop: "1px solid var(--mantine-color-gray-3)", flexShrink: 0 }} gap="xs">
          {selectedCount > 0 && (
            <>
              <Button
                leftSection={<IconDownload size={16} />}
                size="xs"
                variant="light"
                onClick={handleExportSelected}
                loading={exporting}
                disabled={exporting}
              >
                {t("features.databases.settings.exportPGN")} ({selectedCount} {t("features.databases.settings.selected")})
              </Button>
            </>
          )}
          <Button
            leftSection={<IconDownload size={16} />}
            size="xs"
            variant="light"
            onClick={handleExportPGN}
            loading={exporting}
            disabled={exporting || games.length === 0}
          >
            {t("features.databases.settings.exportPGN")} ({games.length})
          </Button>
        </Group>
      )}
    </Stack>
  );
}

export default memo(GamesTable);
