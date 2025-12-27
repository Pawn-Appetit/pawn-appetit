import { Box, Button, Group, NativeSelect, SegmentedControl, Stack, Text } from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { parseSquare } from "chessops";
import { EMPTY_BOARD_FEN, makeFen, parseFen } from "chessops/fen";
import { useAtom } from "jotai";
import { useRef, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Chessground } from "@/components/Chessground";
import PiecesGrid from "@/features/boards/components/PiecesGrid";
import { PlayerSearchInput } from "@/features/databases/components/PlayerSearchInput";
import { currentLocalOptionsAtom } from "@/state/atoms";
import { formatDateToPGN, parseDate } from "@/utils/format";
import { commands } from "@/bindings";

function LocalOptionsPanel({ boardFen }: { boardFen: string }) {
  const boardRef = useRef(null);
  const [options, setOptions] = useAtom(currentLocalOptionsAtom);
  const { t } = useTranslation();
  const [downloadingCache, setDownloadingCache] = useState(false);
  const setSimilarStructure = async (fen: string) => {
    const setup = parseFen(fen).unwrap();
    for (const square of setup.board.pawn.complement()) {
      setup.board.take(square);
    }
    const fenResult = makeFen(setup);
    setOptions((q) => ({ ...q, type: "partial", fen: fenResult }));
  };

  return (
    <Stack>
      <Group>
        <Group>
          <Text fw="bold">{t("databaseOptions.player")}:</Text>
          {options.path && (
            <PlayerSearchInput
              label={t("databaseOptions.search")}
              value={options.player ?? undefined}
              file={options.path}
              setValue={(v) => setOptions((q) => ({ ...q, player: v || null }))}
            />
          )}
        </Group>
        <Group>
          <Text fw="bold">{t("databaseOptions.color")}:</Text>
          <SegmentedControl
            data={[
              { value: "white", label: t("chess.white") },
              { value: "black", label: t("chess.black") },
            ]}
            value={options.color}
            onChange={(v) => setOptions({ ...options, color: v as "white" | "black" })}
          />
        </Group>
        <Group>
          <Text fw="bold">{t("databaseOptions.result")}:</Text>
          <NativeSelect
            data={[
              { value: "any", label: t("databaseOptions.any") },
              { value: "whitewon", label: t("databaseOptions.whiteWon") },
              { value: "draw", label: t("databaseOptions.draw") },
              { value: "blackwon", label: t("databaseOptions.blackWon") },
            ]}
            value={options.result}
            onChange={(v) =>
              setOptions({
                ...options,
                result: v.currentTarget.value as "any" | "whitewon" | "draw" | "blackwon",
              })
            }
          />
        </Group>
        <Group>
          <DateInput
            label={t("databaseOptions.from")}
            placeholder={t("databaseOptions.startDate")}
            valueFormat="YYYY-MM-DD"
            clearable
            value={parseDate(options.start_date)}
            onChange={(value) =>
              setOptions({
                ...options,
                start_date: formatDateToPGN(value),
              })
            }
          />
          <DateInput
            label={t("databaseOptions.to")}
            placeholder={t("databaseOptions.endDate")}
            valueFormat="YYYY-MM-DD"
            clearable
            value={parseDate(options.end_date)}
            onChange={(value) =>
              setOptions({
                ...options,
                end_date: formatDateToPGN(value),
              })
            }
          />
        </Group>
      </Group>

      <Group>
        <Text fw="bold">{t("databaseOptions.position")}:</Text>
        <SegmentedControl
          data={[
            { value: "exact", label: t("databaseOptions.exact") },
            { value: "partial", label: t("databaseOptions.partial") },
          ]}
          value={options.type}
          onChange={(v) => setOptions({ ...options, type: v as "exact" | "partial" })}
        />
      </Group>

      <Group>
        <Stack>
          <Box ref={boardRef}>
            <Chessground
              fen={options.fen}
              coordinates={false}
              lastMove={[]}
              movable={{
                free: true,
                color: "both",
                events: {
                  after: (orig, dest) => {
                    const setup = parseFen(options.fen).unwrap();
                    const p = setup.board.take(parseSquare(orig)!)!;
                    setup.board.set(parseSquare(dest)!, p);
                    setOptions((q) => ({ ...q, fen: makeFen(setup) }));
                  },
                },
              }}
            />
          </Box>

          <Group>
            <Button
              variant="default"
              onClick={() => {
                setOptions((q) => ({ ...q, type: "exact", fen: boardFen }));
              }}
            >
              {t("databaseOptions.currentPosition")}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setSimilarStructure(boardFen);
              }}
            >
              {t("databaseOptions.similarStructure")}
            </Button>
            <Button
              variant="default"
              onClick={() => {
                setOptions((q) => ({
                  ...q,
                  type: "partial",
                  fen: EMPTY_BOARD_FEN,
                }));
              }}
            >
              {t("databaseOptions.empty")}
            </Button>
          </Group>
        </Stack>

        <Box flex={1} style={{ display: "flex", flexDirection: "column" }} h="30rem">
          <PiecesGrid
            boardRef={boardRef}
            fen={options.fen}
            vertical
            onPut={(newFen) => {
              setOptions((q) => ({ ...q, fen: newFen }));
            }}
          />
        </Box>
      </Group>

      <Stack gap="xs" mt="md" p="md" style={{ border: "1px solid var(--mantine-color-default-border)", borderRadius: "var(--mantine-radius-sm)" }}>
        <Text fw="bold" size="sm">{t("databaseOptions.downloadPositionCache")}</Text>
        <Text size="xs" c="dimmed">{t("databaseOptions.downloadPositionCacheDesc")}</Text>
        <Button
          variant="light"
          onClick={async () => {
            setDownloadingCache(true);
            try {
              const result = await commands.downloadPositionCache();
              if (result.status === "error") {
                console.error("Failed to download position cache:", result.error);
                alert(`Failed to download position cache: ${result.error}`);
                setDownloadingCache(false);
              } else {
                alert(t("databaseOptions.positionCacheDownloaded"));
                setDownloadingCache(false);
              }
            } catch (error) {
              console.error("Failed to download position cache:", error);
              alert(`Failed to download position cache: ${error}`);
              setDownloadingCache(false);
            }
          }}
          disabled={downloadingCache}
          loading={downloadingCache}
          size="sm"
        >
          {t("databaseOptions.downloadPositionCache")}
        </Button>
      </Stack>
    </Stack>
  );
}

export default LocalOptionsPanel;
