import { Accordion, Badge, Group, Paper, SimpleGrid, Stack, Text } from "@mantine/core";
import { parseUci } from "chessops";
import { useContext } from "react";
import { useTranslation } from "react-i18next";
import useSWRImmutable from "swr/immutable";
import { match, P } from "ts-pattern";
import { useStore } from "zustand";
import { TreeStateContext } from "@/common/components/TreeStateContext";
import { getTablebaseInfo, type TablebaseCategory } from "@/utils/lichess/api";
import * as classes from "./TablebaseInfo.css";

function TablebaseInfo({ fen, turn }: { fen: string; turn: "white" | "black" }) {
  const store = useContext(TreeStateContext)!;
  const makeMove = useStore(store, (s) => s.makeMove);
  const { t } = useTranslation();
  const { data, error, isLoading } = useSWRImmutable(
    ["tablebase", fen],
    async ([_, fen]) => await getTablebaseInfo(fen),
  );

  const sortedMoves = data?.moves.sort((a, b) => {
    if (a.category === "win" && b.category !== "win") {
      return 1;
    }
    if (a.category !== "win" && b.category === "win") {
      return -1;
    }
    if (a.category === "loss" && b.category !== "loss") {
      return -1;
    }
    if (a.category !== "loss" && b.category === "loss") {
      return 1;
    }
    return 0;
  });

  return (
    <Paper withBorder>
      <Accordion
        styles={{
          label: {
            padding: "0.5rem",
          },
        }}
      >
        <Accordion.Item value="tablebase">
          <Accordion.Control>
            <Group>
              <Text fw="bold">{t("features.tablebase.title")}</Text>
              {isLoading && (
                <Group p="xs">
                  <Badge variant="transparent">{t("common.loading")}</Badge>
                </Group>
              )}
              {error && (
                <Text ta="center">
                  {t("features.tablebase.error")}
                  {error.message}
                </Text>
              )}
              {data && <OutcomeBadge category={data.category} turn={turn} wins />}
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            {data && (
              <Stack gap="xs">
                <SimpleGrid cols={3}>
                  {sortedMoves?.map((m) => (
                    <Paper
                      withBorder
                      key={m.san}
                      px="xs"
                      onClick={() => {
                        makeMove({ payload: parseUci(m.uci)! });
                      }}
                      className={classes.info}
                    >
                      <Group gap="xs" justify="space-between" wrap="nowrap">
                        <Text fz="0.9rem" fw={600} ta="center">
                          {m.san}
                        </Text>
                        <OutcomeBadge
                          category={m.category}
                          dtz={Math.abs(m.dtz)}
                          dtm={m.dtm}
                          turn={turn === "white" ? "black" : "white"}
                        />
                      </Group>
                    </Paper>
                  ))}
                </SimpleGrid>
              </Stack>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Paper>
  );
}

function OutcomeBadge({
  category,
  turn,
  wins,
  dtz,
  dtm,
}: {
  category: TablebaseCategory;
  turn: "white" | "black";
  wins?: boolean;
  dtz?: number;
  dtm?: number;
}) {
  const { t } = useTranslation();
  const normalizedCategory = match(category)
    .with("win", () => (turn === "white" ? t("chess.outcome.whiteWins") : t("chess.outcome.blackWins")))
    .with("loss", () => (turn === "white" ? t("chess.outcome.blackWins") : t("chess.outcome.whiteWins")))
    .with(P.union("draw", "blessed-loss", "cursed-win"), () => t("chess.outcome.draw"))
    .with(P.union("unknown", "maybe-win", "maybe-loss"), () => t("Tablebase.Unknown"))
    .exhaustive();

  const color = match(category)
    .with("win", () => (turn === "white" ? "white" : "black"))
    .with("loss", () => (turn === "white" ? "black" : "white"))
    .otherwise(() => "gray");

  const label = wins
    ? normalizedCategory
    : match(category)
        .with("draw", () => t("chess.outcome.draw"))
        .with("unknown", () => t("Tablebase.Unknown"))
        .otherwise(() =>
          dtm ? t("features.tablebase.dtm", { count: Math.abs(dtm) }) : t("features.tablebase.dtz", { count: dtz }),
        );

  return (
    <Group p="xs">
      <Badge autoContrast color={color}>
        {label}
      </Badge>
      {["blessed-loss", "cursed-win", "maybe-win", "maybe-loss"].includes(category) && wins && (
        <Text c="dimmed" fz="xs">
          {t("features.tablebase.fiftyMoveRule")}
        </Text>
      )}
    </Group>
  );
}

export default TablebaseInfo;
