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
import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { useAtom, useSetAtom } from "jotai";
import { DataTable } from "mantine-datatable";
import { useContext, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { useStore } from "zustand";
import type { GameSort, NormalizedGame, Outcome } from "@/bindings";
import { useLanguageChangeListener } from "@/common/hooks/useLanguageChangeListener";
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
  const store = useContext(DatabaseViewStateContext)!;
  const file = useStore(store, (s) => s.database?.file)!;
  const query = useStore(store, (s) => s.games.query);
  const setQuery = useStore(store, (s) => s.setGamesQuery);
  const openedSettings = useStore(store, (s) => s.games.isFilterExpanded);
  const toggleOpenedSettings = useStore(store, (s) => s.toggleGamesOpenedSettings);
  const { t } = useTranslation();

  const [selectedGame, setSelectedGame] = useState<number | null>(null);

  const navigate = useNavigate();

  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const forceUpdate = useForceUpdate();
  useLanguageChangeListener(forceUpdate);

  const { data, isLoading, mutate } = useSWR(["games", query], () => query_games(file, query));

  const games = data?.data ?? [];
  const count = data?.count;

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
                    sides={query.sides!}
                    setSides={(value) => setQuery({ ...query, sides: value })}
                    selectingFor="player"
                  />
                }
                label={t("chess.player")}
                file={file}
              />
              <PlayerSearchInput
                value={query?.player2 ?? undefined}
                setValue={(value) => setQuery({ ...query, player2: value })}
                rightSection={
                  <SideInput
                    sides={query.sides!}
                    setSides={(value) => setQuery({ ...query, sides: value })}
                    selectingFor="opponent"
                  />
                }
                label={t("chess.opponent")}
                file={file}
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
                db: file,
                id: record.id,
              },
            });
            navigate({ to: "/boards" });
          }}
          columns={[
            {
              accessor: "white",
              title: t("chess.white"),
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
              title: t("chess.black"),
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
              title: t("features.gameTable.date"),
              render: ({ date }) =>
                t("formatters.dateFormat", {
                  date: parseDate(date),
                  interpolation: { escapeValue: false },
                }),
            },
            {
              accessor: "result",
              title: t("chess.outcome.outcome"),
              render: ({ result }) => result?.replaceAll("1/2", "½"),
            },
            { accessor: "ply_count", title: t("features.gameTable.plies"), sortable: true },
            { accessor: "event", title: t("features.gameTable.event") },
            {
              accessor: "site",
              title: t("features.gameTable.site"),
              render: ({ site }) => (
                <ActionIcon onClick={() => invoke("open_external_link", { url: site })}>
                  <IconExternalLink size="1rem" />
                </ActionIcon>
              ),
            },
          ]}
          rowClassName={(_, i) => (i === selectedGame ? classes.selected : "")}
          noRecordsText={t("Common.NoGamesFound")}
          totalRecords={count!}
          recordsPerPage={query.options?.pageSize ?? 25}
          page={query.options?.page ?? 1}
          onPageChange={(page) =>
            setQuery({
              ...query,
              options: {
                ...query.options!,
                page,
              },
            })
          }
          onRecordsPerPageChange={(value) =>
            setQuery({
              ...query,
              options: { ...query.options!, pageSize: value },
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
                ...query.options!,
                sort: value.columnAccessor as GameSort,
                direction: value.direction,
              },
            })
          }
          recordsPerPageOptions={[10, 25, 50]}
          onRowClick={({ index }) => {
            setSelectedGame(index);
          }}
        />
      }
      preview={
        selectedGame !== null && games[selectedGame] ? (
          <GameCard game={games[selectedGame]} file={file} mutate={mutate} />
        ) : (
          <Center h="100%">
            <Text>{t("common.noGameSelected")}</Text>
          </Center>
        )
      }
    />
  );
}

export default GameTable;
