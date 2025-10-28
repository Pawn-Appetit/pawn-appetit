import { Box } from "@mantine/core";
import { Chessground as NativeChessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { Key, Piece } from "chessground/types";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { boardImageAtom, moveMethodAtom } from "@/state/atoms";

export interface ChessgroundProps extends Config {
  setBoardFen?: (fen: string) => void;
  selectedPiece?: Piece | null;
  setSelectedPiece?: (piece: Piece | null) => void;
}

export function Chessground({ setBoardFen, selectedPiece, setSelectedPiece, ...chessgroundConfig }: ChessgroundProps) {
  const [api, setApi] = useState<Api | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const moveMethod = useAtomValue(moveMethodAtom);
  const boardImage = useAtomValue(boardImageAtom);

  const setBoardFenRef = useRef(setBoardFen);
  const setSelectedPieceRef = useRef(setSelectedPiece);

  useEffect(() => {
    setBoardFenRef.current = setBoardFen;
    setSelectedPieceRef.current = setSelectedPiece;
  });

  const handleChange = useCallback(() => {
    if (setBoardFenRef.current && api) {
      setBoardFenRef.current(api.getFen());
    }
  }, [api]);

  const handleSelect = useCallback(
    (key: Key) => {
      if (chessgroundConfig.movable?.free && selectedPiece && api) {
        api.setPieces(new Map([[key, selectedPiece]]));
        if (setBoardFenRef.current) {
          setBoardFenRef.current(api.getFen());
        }
      }
    },
    [chessgroundConfig.movable?.free, selectedPiece, api],
  );

  useEffect(() => {
    if (!ref.current || api) return;

    const config: Config = {
      ...chessgroundConfig,
      addDimensionsCssVarsTo: ref.current,
      events: {
        ...chessgroundConfig.events,
        change: handleChange,
        select: handleSelect,
      },
      draggable: {
        ...chessgroundConfig.draggable,
        enabled: moveMethod !== "select",
      },
      selectable: {
        ...chessgroundConfig.selectable,
        enabled: moveMethod !== "drag",
      },
    };

    const chessgroundApi = NativeChessground(ref.current, config);
    setApi(chessgroundApi);

    return () => {
      chessgroundApi.destroy?.();
      setApi(null);
    };
  }, []);

  useEffect(() => {
    if (!api) return;

    const config: Config = {
      ...chessgroundConfig,
      events: {
        ...chessgroundConfig.events,
        change: handleChange,
        select: handleSelect,
      },
      draggable: {
        ...chessgroundConfig.draggable,
        enabled: moveMethod !== "select",
      },
      selectable: {
        ...chessgroundConfig.selectable,
        enabled: moveMethod !== "drag",
      },
    };

    api.set(config);
  }, [
    api,
    handleChange,
    handleSelect,
    moveMethod,
    chessgroundConfig.fen,
    chessgroundConfig.orientation,
    chessgroundConfig.turnColor,
    chessgroundConfig.movable,
    chessgroundConfig.premovable,
    chessgroundConfig.predroppable,
    chessgroundConfig.draggable?.showGhost,
    chessgroundConfig.selectable?.enabled,
    chessgroundConfig.highlight,
    chessgroundConfig.animation,
  ]);

  useEffect(() => {
    if (!chessgroundConfig.movable?.free && selectedPiece && setSelectedPieceRef.current) {
      setSelectedPieceRef.current(null);
    }
  }, [chessgroundConfig.movable?.free, selectedPiece]);

  return (
    <Box
      ref={ref}
      style={{
        aspectRatio: 1,
        width: "100%",
        "--board-image": `url('/board/${boardImage}')`,
      }}
    />
  );
}
