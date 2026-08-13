import type { Color, Piece as PieceType } from "@lichess-org/chessground/types";
import {
  ActionIcon,
  Box,
  Button,
  Group,
  NativeSelect,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import { DateInput } from "@mantine/dates";
import { IconSwitchVertical } from "@tabler/icons-react";
import { makeSquare, parseSquare } from "chessops";
import { EMPTY_BOARD_FEN, makeFen, parseFen } from "chessops/fen";
import { useAtom } from "jotai";
import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Chessground } from "@/components/Chessground";
import PiecesGrid from "@/features/boards/components/PiecesGrid";
import { PlayerSearchInput } from "@/features/databases/components/PlayerSearchInput";
import { currentLocalOptionsAtom } from "@/state/atoms";
import { formatDateToPGN, parseDate } from "@/utils/format";
import { invalidExactMaterialCounts, MATERIAL_ROLES, placedMaterialCounts } from "@/utils/material";

/** Squares a piece stands on in `fen`, as square indices (0 = a1 … 63 = h8). */
function occupiedSquares(fen: string): Set<number> {
  const setup = parseFen(fen).unwrap();
  return new Set(setup.board.occupied);
}

/**
 * Drop any must-be-empty mark from a square that now holds a piece.
 *
 * The three per-square states are mutually exclusive, so placing a piece
 * turns that square from must-be-empty into required. Removing a piece is
 * the reverse only in part: the square goes back to don't-care, never to
 * must-be-empty.
 */
function withoutOccupied(forbidden: number[], fen: string): number[] {
  const occupied = occupiedSquares(fen);
  return forbidden.filter((square) => !occupied.has(square));
}

/**
 * Kings are left out: every legal position has exactly one a side, so a cap on
 * them can only be a no-op or make the query unsatisfiable.
 */
const CAPPABLE_ROLES = MATERIAL_ROLES;
const COLORS = ["white", "black"] as const;

function LocalOptionsPanel({ boardFen }: { boardFen: string }) {
  const boardRef = useRef(null);
  const [options, setOptions] = useAtom(currentLocalOptionsAtom);
  // The palette holds twelve pieces plus the must-be-empty marker, and at most
  // one of them is selected at a time.
  const [selected, setSelected] = useState<PieceType | "marker" | null>(null);
  // A query board is built by hand rather than played, so which side sits at
  // the bottom is a property of this panel alone, not of the game being viewed.
  const [orientation, setOrientation] = useState<Color>("white");
  const { t } = useTranslation();

  // Marking squares only means anything for a partial query; an exact one
  // already pins every square, empty ones included.
  const isPartial = options.type === "partial";
  const selectedPiece = selected === "marker" ? null : selected;

  // A stable object, so the board is only reconfigured when the marks change.
  // Drawing is disabled: right-drag would otherwise scribble shapes over the
  // same layer the must-be-empty marks live on.
  const drawable = useMemo(
    () => ({
      enabled: false,
      visible: true,
      autoShapes: (options.forbidden_squares ?? []).map((square) => ({
        orig: makeSquare(square),
        brush: "red",
      })),
    }),
    [options.forbidden_squares],
  );

  const setFen = (fen: string) => {
    // Chessground reports board-only FENs; normalise so the backend always
    // receives a complete one whatever the edit was.
    const normalized = makeFen(parseFen(fen).unwrap());
    setOptions((q) => ({
      ...q,
      fen: normalized,
      forbidden_squares: withoutOccupied(q.forbidden_squares ?? [], normalized),
    }));
  };

  const toggleForbidden = (square: number) => {
    setOptions((q) => {
      if (occupiedSquares(q.fen).has(square)) return q;
      const current = q.forbidden_squares ?? [];
      return {
        ...q,
        forbidden_squares: current.includes(square)
          ? current.filter((s) => s !== square)
          : [...current, square],
      };
    });
  };

  const exactCounts = options.exact_pieces ?? {};
  const boardCounts = useMemo(() => placedMaterialCounts(options.fen), [options.fen]);
  const invalidCounts = invalidExactMaterialCounts(options.fen, exactCounts);

  const setExactCount = (key: string, count: number | null) => {
    setOptions((q) => {
      const next = { ...(q.exact_pieces ?? {}) };
      if (count === null) {
        delete next[key];
      } else {
        next[key] = count;
      }
      return { ...q, exact_pieces: Object.keys(next).length ? next : undefined };
    });
  };

  const setSimilarStructure = async (fen: string) => {
    const setup = parseFen(fen).unwrap();
    for (const square of setup.board.pawn.complement()) {
      setup.board.take(square);
    }
    const fenResult = makeFen(setup);
    setOptions((q) => ({ ...q, type: "partial", fen: fenResult, forbidden_squares: [] }));
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
              { value: "any", label: t("databaseOptions.eitherColor") },
            ]}
            value={options.color}
            onChange={(v) => setOptions({ ...options, color: v as "white" | "black" | "any" })}
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
          onChange={(v) => {
            const type = v as "exact" | "partial";
            // Marks are partial-only, so drop them rather than keep them
            // invisibly attached to an exact query.
            setOptions({
              ...options,
              type,
              forbidden_squares: type === "partial" ? options.forbidden_squares : [],
            });
            if (type !== "partial") setSelected(null);
          }}
        />
      </Group>

      {isPartial && (
        <Group align="flex-start" gap="xl">
          <Stack gap={4}>
            <Group gap="xs">
              <Text fw="bold">{t("databaseOptions.materialExact")}:</Text>
              <Button
                size="compact-xs"
                variant="subtle"
                onClick={() => setOptions((q) => ({ ...q, exact_pieces: undefined }))}
              >
                {t("databaseOptions.clearMaterial")}
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              {t("databaseOptions.materialExactHint")}
            </Text>
            <Group align="flex-start" gap="lg" wrap="nowrap">
              {COLORS.map((color) => (
                <Stack key={color} gap={2}>
                  {/* Which column is which is not obvious from the piece
                      images alone at this size. */}
                  <Text size="xs" c="dimmed" ta="center">
                    {color === "white" ? t("chess.white") : t("chess.black")}
                  </Text>
                  {CAPPABLE_ROLES.map((role) => {
                    const key = `${color}-${role}`;
                    return (
                      <Group key={key} gap={4} wrap="nowrap">
                        <Box
                          className={`${role} ${color}`}
                          style={{
                            width: 22,
                            height: 22,
                            backgroundSize: "contain",
                            backgroundRepeat: "no-repeat",
                            backgroundPosition: "center",
                          }}
                        />
                        <NumberInput
                          size="xs"
                          w={58}
                          min={0}
                          max={10}
                          // Spinners double the height of every row for a
                          // value that is nearly always typed once or left be.
                          hideControls
                          allowNegative={false}
                          allowDecimal={false}
                          placeholder={t("databaseOptions.anyCount")}
                          aria-label={key}
                          error={
                            exactCounts[key] !== undefined &&
                            exactCounts[key] < (boardCounts[key] ?? 0)
                          }
                          value={exactCounts[key] ?? ""}
                          onChange={(value) =>
                            setExactCount(
                              key,
                              value === "" || value === null ? null : Number(value),
                            )
                          }
                        />
                      </Group>
                    );
                  })}
                </Stack>
              ))}
            </Group>
            {invalidCounts.length > 0 && (
              <Text size="xs" c="red">
                {t("databaseOptions.materialCountTooLow")}
              </Text>
            )}
          </Stack>
        </Group>
      )}

      {/* The board and its palette sit side by side and stay whole: a query
          board is for placing a handful of pieces, so it gains nothing from
          filling the panel, and a board taller than the panel is unusable. */}
      <Group align="stretch" wrap="nowrap" gap="xs">
        <Box
          ref={boardRef}
          style={{
            // Shrinks with a narrow panel, but never grows past a size that
            // leaves room for the filters above it.
            flex: "1 1 auto",
            minWidth: 0,
            maxWidth: "22rem",
          }}
        >
          <Chessground
            fen={options.fen}
            // Ranks and files are shown whatever the global board setting
            // says: an empty query board has no pieces to read orientation
            // from, so without them a flipped board is indistinguishable.
            coordinates
            orientation={orientation}
            lastMove={[]}
            drawable={drawable}
            // Chessground only swallows the context menu while drawing is
            // enabled, and we turn drawing off.
            disableContextMenu
            // Dragging a piece off the board is the way to remove it, and
            // the resulting change comes back through setBoardFen.
            setBoardFen={setFen}
            draggable={{ deleteOnDropOff: true }}
            // Selecting a piece in the palette makes clicks place it.
            selectedPiece={selectedPiece}
            setSelectedPiece={setSelected}
            movable={{
              // Always free, so pieces stay draggable (and removable)
              // whatever is selected in the palette.
              free: true,
              color: "both",
              events: {
                after: (orig, dest) => {
                  const setup = parseFen(options.fen).unwrap();
                  const p = setup.board.take(parseSquare(orig)!)!;
                  setup.board.set(parseSquare(dest)!, p);
                  setFen(makeFen(setup));
                },
              },
            }}
            events={{
              select: (key) => {
                // With a piece selected the wrapper places it instead; with
                // nothing (or the marker) selected, clicking an empty square
                // toggles whether it must be empty.
                if (!isPartial || selectedPiece) return;
                toggleForbidden(parseSquare(key)!);
              },
            }}
          />
        </Box>

        <Box
          style={{
            display: "flex",
            flexDirection: "column",
            // A narrow strip beside the board. The group stretches it to the
            // board's height, so the two always line up whatever size the
            // board settles at.
            flex: "0 0 auto",
            width: "5rem",
          }}
        >
          <PiecesGrid
            boardRef={boardRef}
            fen={options.fen}
            // Dragging from the palette maps pointer position to a square, so
            // it has to agree with which way the board is facing.
            orientation={orientation}
            vertical
            onPut={(newFen) => {
              setFen(newFen);
            }}
            selectedPiece={selectedPiece}
            setSelectedPiece={setSelected}
            emptyMarker={
              isPartial
                ? {
                    selected: selected === "marker",
                    label: t("databaseOptions.markEmpty"),
                    onSelect: () =>
                      setSelected((current) => (current === "marker" ? null : "marker")),
                  }
                : undefined
            }
          />
        </Box>
      </Group>

      <Group>
        <Tooltip label={t("keybindings.flipBoard")} withArrow>
          <ActionIcon
            variant="default"
            size="lg"
            aria-label={t("keybindings.flipBoard")}
            onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}
          >
            <IconSwitchVertical size="1.3rem" />
          </ActionIcon>
        </Tooltip>
        <Button
          variant="default"
          onClick={() => {
            setOptions((q) => ({
              ...q,
              type: "exact",
              fen: boardFen,
              forbidden_squares: [],
            }));
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
              forbidden_squares: [],
            }));
          }}
        >
          {t("databaseOptions.empty")}
        </Button>
      </Group>
    </Stack>
  );
}

export default LocalOptionsPanel;
