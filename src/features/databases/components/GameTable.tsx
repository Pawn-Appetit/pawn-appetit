import {
  ActionIcon,
  Box,
  Center,
  Collapse,
  Flex,
  Group,
  InputWrapper,
  RangeSlider,
  Select,
  Stack,
  Text,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { useForceUpdate, useHotkeys } from "@mantine/hooks";
import { IconExternalLink, IconFilter, IconFilterFilled } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useAtom, useSetAtom } from "jotai";
import { DataTable } from "mantine-datatable";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import type { GameSort, NormalizedGame, Outcome } from "@/bindings";
import { useLanguageChangeListener } from "@/hooks/useLanguageChangeListener";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { query_games } from "@/utils/db";
import { formatDateToPGN, parseDate } from "@/utils/format";
import { createTab } from "@/utils/tabs";
import { DatabaseViewStateContext } from "./DatabaseViewStateContext";
import GameCard from "./GameCard";
import GridLayout from "./GridLayout";
import { PlayerSearchInput } from "./PlayerSearchInput";
import { SideInput } from "./SideInput";
import * as classes from "./styles.css";

function GameTable() {
  const store = useContext(DatabaseViewStateContext);
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();
  const [selectedGame, setSelectedGame] = useState<number | null>(null);
  const navigate = useNavigate();
  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const forceUpdate = useForceUpdate();
  useLanguageChangeListener(forceUpdate);

  if (!store) return null;

  const file = useStore(store, (s) => s.database?.file);
  const query = useStore(store, (s) => s.games.query);
  const setQuery = useStore(store, (s) => s.setGamesQuery);
  const openedSettings = useStore(store, (s) => s.games.isFilterExpanded);
  const toggleOpenedSettings = useStore(store, (s) => s.toggleGamesOpenedSettings);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["games", query, file],
    queryFn: () => (file ? query_games(file, query) : null),
    enabled: !!file,
  });

  const mutate = () => refetch();

  const games = data?.data ?? [];
  const count = data?.count;

  // Define all possible columns
  const allColumns = [
    {
      accessor: "white",
      title: t("chess.white"),
      render: ({ white, white_elo }: NormalizedGame) => (
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
      title: t("chess.black"),
      render: ({ black, black_elo }: NormalizedGame) => (
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
      title: t("features.gameTable.date"),
      render: ({ date }: NormalizedGame) =>
        t("formatters.dateFormat", {
          date: parseDate(date),
          interpolation: { escapeValue: false },
        }),
    },
    {
      accessor: "result",
      title: t("chess.outcome.outcome"),
      render: ({ result }: NormalizedGame) => result?.replaceAll("1/2", "½"),
    },
    { accessor: "ply_count", title: t("features.gameTable.plies"), sortable: true },
    { accessor: "event", title: t("features.gameTable.event") },
    {
      accessor: "site",
      title: t("features.gameTable.site"),
      render: ({ site }: NormalizedGame) => (
        <ActionIcon onClick={() => invoke("open_external_link", { url: site })}>
          <IconExternalLink size="1rem" />
        </ActionIcon>
      ),
    },
  ];

  // Filter columns based on responsive configuration
  const getVisibleColumns = () => {
    switch (layout.databases.density) {
      case "compact":
        return ["white", "black", "result", "date"]; // Essential columns for compact
      case "normal":
        return ["white", "black", "date", "result", "ply_count", "event", "site"]; // All columns for normal
      case "comfortable":
        return ["white", "black", "date", "result", "ply_count", "event", "site"]; // All columns for comfortable
      default:
        return ["white", "black", "date", "result", "ply_count", "event", "site"];
    }
  };

  const responsiveColumns = allColumns.filter((column) => getVisibleColumns().includes(column.accessor));

  // Get pagination configuration based on density
  const getPaginationConfig = () => {
    switch (layout.databases.density) {
      case "compact":
        return { pageSize: 10, showSizeChanger: false, showQuickJumper: false };
      case "normal":
        return { pageSize: 25, showSizeChanger: true, showQuickJumper: true };
      case "comfortable":
        return { pageSize: 25, showSizeChanger: true, showQuickJumper: true };
      default:
        return { pageSize: 25, showSizeChanger: true, showQuickJumper: true };
    }
  };

  // Create pagination props conditionally
  const paginationProps = getPaginationConfig().showSizeChanger
    ? {
        recordsPerPageOptions: [10, 25, 50],
        onRecordsPerPageChange: (value: number) =>
          setQuery({
            ...query,
            options: {
              ...query.options,
              pageSize: value,
              skipCount: query.options?.skipCount ?? false,
              sort: query.options?.sort ?? "date",
              direction: query.options?.direction ?? "desc",
            },
          }),
      }
    : {};

  useHotkeys([
    [
      "ArrowUp",
      () => {
        setSelectedGame((prev) => {
          if (prev === null) {
            return null;
          }
          if (prev === 0) {
            return 0;
          }
          return prev - 1;
        });
      },
    ],
    [
      "ArrowDown",
      () => {
        setSelectedGame((prev) => {
          if (prev === null) {
            return 0;
          }
          if (prev === games.length - 1) {
            return games.length - 1;
          }
          return prev + 1;
        });
      },
    ],
  ]);

  return (
    <GridLayout
      search={
        <Flex style={{ gap: 20 }}>
          <Box style={{ flexGrow: 1 }}>
            <Group grow>
              <PlayerSearchInput
                value={query?.player1 ?? undefined}
                setValue={(value) => setQuery({ ...query, player1: value })}
                rightSection={
                  <SideInput
                    sides={query.sides ?? "WhiteBlack"}
                    setSides={(value) => setQuery({ ...query, sides: value })}
                    selectingFor="player"
                  />
                }
                label={t("chess.player")}
                file={file || ""}
              />
              <PlayerSearchInput
                value={query?.player2 ?? undefined}
                setValue={(value) => setQuery({ ...query, player2: value })}
                rightSection={
                  <SideInput
                    sides={query.sides ?? "WhiteBlack"}
                    setSides={(value) => setQuery({ ...query, sides: value })}
                    selectingFor="opponent"
                  />
                }
                label={t("chess.opponent")}
                file={file || ""}
              />
            </Group>
            <Collapse in={openedSettings} mx={10}>
              <Stack mt="md">
                <Group grow>
                  <InputWrapper label="ELO">
                    <RangeSlider
                      step={10}
                      min={0}
                      max={3000}
                      marks={[
                        { value: 1000, label: "1000" },
                        { value: 2000, label: "2000" },
                        { value: 3000, label: "3000" },
                      ]}
                      value={query.range1 ?? undefined}
                      onChangeEnd={(value) => setQuery({ ...query, range1: value })}
                    />
                  </InputWrapper>

                  <InputWrapper label="ELO">
                    <RangeSlider
                      step={10}
                      min={0}
                      max={3000}
                      marks={[
                        { value: 1000, label: "1000" },
                        { value: 2000, label: "2000" },
                        { value: 3000, label: "3000" },
                      ]}
                      value={query.range2 ?? undefined}
                      onChangeEnd={(value) => setQuery({ ...query, range2: value })}
                    />
                  </InputWrapper>
                </Group>
                <Select
                  label={t("chess.outcome.outcome")}
                  value={query.outcome}
                  onChange={(value) =>
                    setQuery({
                      ...query,
                      outcome: (value as Outcome | null) ?? undefined,
                    })
                  }
                  clearable
                  placeholder={t("chess.outcome.selectOutcome")}
                  data={[
                    { label: t("chess.outcome.whiteWins"), value: "1-0" },
                    { label: t("chess.outcome.blackWins"), value: "0-1" },
                    { label: t("chess.outcome.draw"), value: "1/2-1/2" },
                  ]}
                />
                <Group>
                  <DateInput
                    label={t("features.gameTable.from")}
                    placeholder={t("features.gameTable.startDate")}
                    clearable
                    valueFormat="YYYY-MM-DD"
                    value={parseDate(query.start_date)}
                    onChange={(value) =>
                      setQuery({
                        ...query,
                        start_date: formatDateToPGN(value),
                      })
                    }
                  />
                  <DateInput
                    label={t("features.gameTable.to")}
                    placeholder={t("features.gameTable.endDate")}
                    clearable
                    valueFormat="YYYY-MM-DD"
                    value={parseDate(query.end_date)}
                    onChange={(value) =>
                      setQuery({
                        ...query,
                        end_date: formatDateToPGN(value),
                      })
                    }
                  />
                </Group>
              </Stack>
            </Collapse>
          </Box>
          <ActionIcon style={{ flexGrow: 0 }} onClick={() => toggleOpenedSettings()}>
            {openedSettings ? <IconFilterFilled size="1rem" /> : <IconFilter size="1rem" />}
          </ActionIcon>
        </Flex>
      }
      table={
        <DataTable<NormalizedGame>
          withTableBorder
          highlightOnHover
          records={games}
          fetching={isLoading}
          onRowDoubleClick={({ record }) => {
            createTab({
              tab: {
                name: `${record.white} - ${record.black}`,
                type: "analysis",
              },
              setTabs,
              setActiveTab,
              pgn: record.moves,
              headers: record,
              srcInfo: {
                type: "db",
                db: file || "",
                id: record.id,
              },
            });
            navigate({ to: "/boards" });
          }}
          columns={responsiveColumns}
          rowClassName={(_, i) => (i === selectedGame ? classes.selected : "")}
          noRecordsText={t("common.noGameSelected")}
          totalRecords={count ?? 0}
          recordsPerPage={query.options?.pageSize ?? getPaginationConfig().pageSize}
          page={query.options?.page ?? 1}
          onPageChange={(page) =>
            setQuery({
              ...query,
              options: {
                ...query.options,
                page,
                skipCount: query.options?.skipCount ?? false,
                sort: query.options?.sort ?? "date",
                direction: query.options?.direction ?? "desc",
              },
            })
          }
          sortStatus={{
            columnAccessor: query.options?.sort || "date",
            direction: query.options?.direction || "desc",
          }}
          onSortStatusChange={(value) =>
            setQuery({
              ...query,
              options: {
                ...query.options,
                sort: value.columnAccessor as GameSort,
                direction: value.direction,
                skipCount: query.options?.skipCount ?? false,
                page: query.options?.page ?? 1,
                pageSize: query.options?.pageSize ?? 25,
              },
            })
          }
          {...paginationProps}
          onRowClick={({ index }) => {
            setSelectedGame(index);
          }}
        />
      }
      preview={
        selectedGame !== null && games[selectedGame] ? (
          <GameCard game={games[selectedGame]} file={file || ""} mutate={mutate} />
        ) : (
          <Center h="100%">
            <Text>{t("common.noGameSelected")}</Text>
          </Center>
        )
      }
      isDrawerOpen={selectedGame !== null && games[selectedGame] !== undefined}
      onDrawerClose={() => setSelectedGame(null)}
      drawerTitle={
        selectedGame !== null && games[selectedGame]
          ? `${games[selectedGame].white} vs ${games[selectedGame].black}`
          : "Game Details"
      }
      layoutType={layout.databases.layoutType}
    />
  );
}

export default GameTable;
