import { Box } from "@mantine/core";
import { Chessground as NativeChessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { Piece } from "chessground/types";
import { useAtomValue } from "jotai";
import { useEffect, useRef, useState } from "react";
import { boardImageAtom, moveMethodAtom } from "@/state/atoms";

export function Chessground(
  props: Config & {
    setBoardFen?: (fen: string) => void;
    selectedPiece?: Piece | null;
    setSelectedPiece?: (piece: Piece | null) => void;
  },
) {
  const [api, setApi] = useState<Api | null>(null);

  const ref = useRef<HTMLDivElement>(null);

  const moveMethod = useAtomValue(moveMethodAtom);

  useEffect(() => {
    if (ref?.current == null) return;
    if (api) {
      api.set({
        ...props,
        events: {
          change: () => {
            if (props.setBoardFen && api) {
              props.setBoardFen(api.getFen());
            }
          },
        },
      });
    } else {
      const chessgroundApi = NativeChessground(ref.current, {
        ...props,
        addDimensionsCssVarsTo: ref.current,
        events: {
          change: () => {
            if (props.setBoardFen && chessgroundApi) {
              props.setBoardFen(chessgroundApi.getFen());
            }
          },
        },
        draggable: {
          ...props.draggable,
          enabled: moveMethod !== "select",
        },
        selectable: {
          ...props.selectable,
          enabled: moveMethod !== "drag",
        },
      });
      setApi(chessgroundApi);
    }
  }, [api, props, moveMethod]);

  useEffect(() => {
    // if editingMode it's false then reset selected piece
    if (!props.movable?.free && props.selectedPiece) {
      props.setSelectedPiece?.(null);
    }

    api?.set({
      ...props,
      events: {
        change: () => {
          if (props.setBoardFen && api) {
            props.setBoardFen(api.getFen());
          }
        },
        select: (key) => {
          if (props.movable?.free && props.selectedPiece) {
            api.setPieces(new Map([[key, props.selectedPiece]]));

            if (props.setBoardFen) {
              props.setBoardFen(api.getFen());
            }
          }
        },
      },
    });
  }, [api, props]);

  const boardImage = useAtomValue(boardImageAtom);

  return (
    <Box
      style={{
        aspectRatio: 1,
        width: "100%",
        "--board-image": `url('/board/${boardImage}')`,
      }}
      ref={ref}
    />
  );
}
