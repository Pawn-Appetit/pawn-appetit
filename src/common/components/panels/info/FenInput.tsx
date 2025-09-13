import { Button, Checkbox, Group, Select, Stack, Text } from "@mantine/core";
import type { Setup } from "chessops";
import { EMPTY_FEN, INITIAL_FEN, makeFen, parseFen } from "chessops/fen";
import { memo, useCallback, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { TreeStateContext } from "@/common/components/TreeStateContext";
import { getCastlingSquare, swapMove } from "@/utils/chessops";
import FenSearch from "./FenSearch";

type Castlingrights = {
  k: boolean;
  q: boolean;
};

function getCastlingRights(setup: Setup) {
  let whiteCastling: Castlingrights = { k: false, q: false };
  let blackCastling: Castlingrights = { k: false, q: false };

  if (setup) {
    const whiteKingPos = setup.board.white.intersect(setup.board.king).singleSquare();
    const blackKingPos = setup.board.black.intersect(setup.board.king).singleSquare();

    const whiteKingSquare = getCastlingSquare(setup, "w", "k");
    const whiteQueenSquare = getCastlingSquare(setup, "w", "q");
    const blackKingSquare = getCastlingSquare(setup, "b", "k");
    const blackQueenSquare = getCastlingSquare(setup, "b", "q");

    whiteCastling = {
      k: whiteKingSquare !== undefined && whiteKingPos === 4 ? setup.castlingRights.has(whiteKingSquare) : false,
      q: whiteQueenSquare !== undefined && whiteKingPos === 4 ? setup.castlingRights.has(whiteQueenSquare) : false,
    };
    blackCastling = {
      k: blackKingSquare !== undefined && blackKingPos === 60 ? setup.castlingRights.has(blackKingSquare) : false,
      q: blackQueenSquare !== undefined && blackKingPos === 60 ? setup.castlingRights.has(blackQueenSquare) : false,
    };
  }

  return {
    whiteCastling,
    blackCastling,
  };
}

function FenInput({ currentFen }: { currentFen: string }) {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const setFen = useStore(store, (s) => s.setFen);

  const [setup, error] = useMemo(
    () =>
      parseFen(currentFen).unwrap(
        (v) => [v, null],
        (e) => [null, e],
      ),
    [currentFen],
  );

  if (!setup) {
    return <Text>{error.message}</Text>;
  }

  const { whiteCastling, blackCastling } = useMemo(() => getCastlingRights(setup), [setup]);

  const setCastlingRights = useCallback(
    (color: "w" | "b", side: "q" | "k", value: boolean) => {
      if (setup) {
        const castlingSquare = getCastlingSquare(setup, color, side);
        const kingPos = setup.board[color === "w" ? "white" : "black"].intersect(setup.board.king).singleSquare();
        const initialKingPos = color === "w" ? 4 : 60;

        if (castlingSquare !== undefined && kingPos === initialKingPos) {
          const newCastlingRights = value
            ? setup.castlingRights.with(castlingSquare)
            : setup.castlingRights.without(castlingSquare);
          setFen(makeFen({ ...setup, castlingRights: newCastlingRights }));
        }
      }
    },
    [setup, setFen],
  );

  return (
    <Stack gap="sm">
      <Group>
        <Stack style={{ flexGrow: 1 }}>
          <Text fw="bold">FEN</Text>
          <FenSearch currentFen={currentFen} />
          <Group>
            <Button variant="default" onClick={() => setFen(INITIAL_FEN)}>
              {t("chess.fen.start")}
            </Button>
            <Button variant="default" onClick={() => setFen(EMPTY_FEN)}>
              {t("chess.fen.empty")}
            </Button>
            <Select
              flex={1}
              allowDeselect={false}
              data={[
                { label: t("chess.fen.whiteToMove"), value: "white" },
                { label: t("chess.fen.blackToMove"), value: "black" },
              ]}
              value={setup?.turn || "white"}
              onChange={(value) => {
                if (setup) {
                  const newFen = swapMove(currentFen, value as "white" | "black");
                  setFen(newFen);
                }
              }}
            />
          </Group>
        </Stack>
        <Group>
          <Stack>
            <Text size="sm">{t("chess.white")}</Text>
            <Checkbox
              label="O-O"
              checked={whiteCastling.k}
              onChange={(e) => setCastlingRights("w", "k", e.currentTarget.checked)}
              disabled={!setup}
            />
            <Checkbox
              label="O-O-O"
              checked={whiteCastling.q}
              onChange={(e) => setCastlingRights("w", "q", e.currentTarget.checked)}
              disabled={!setup}
            />
          </Stack>
          <Stack>
            <Text size="sm">{t("chess.black")}</Text>
            <Checkbox
              label="O-O"
              checked={blackCastling.k}
              onChange={(e) => setCastlingRights("b", "k", e.currentTarget.checked)}
              disabled={!setup}
            />
            <Checkbox
              label="O-O-O"
              checked={blackCastling.q}
              onChange={(e) => setCastlingRights("b", "q", e.currentTarget.checked)}
              disabled={!setup}
            />
          </Stack>
        </Group>
      </Group>
    </Stack>
  );
}

export default memo(FenInput);
