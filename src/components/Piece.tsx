import type { Color, Piece } from "@lichess-org/chessground/types";
import type { Square } from "chessops";
import { squareFromCoords } from "chessops/util";
import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import Draggable, { type DraggableEvent } from "react-draggable";

/** Pointer position of a drag event, for mouse and touch alike. */
function clientPosition(event: DraggableEvent): { x: number; y: number } {
  if ("touches" in event && event.touches.length > 0) {
    return { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }
  const { clientX, clientY } = event as MouseEvent;
  return { x: clientX, y: clientY };
}

export default function PieceComponent({
  piece,
  boardRef,
  putPiece,
  size,
  orientation,
  selectedPiece,
  onSelect,
}: {
  piece: Piece;
  boardRef?: React.RefObject<HTMLDivElement>;
  putPiece?: (square: Square, piece: Piece) => void;
  size?: number | string;
  orientation?: Color;
  selectedPiece?: Piece | null;
  onSelect?: (piece: Piece, isDragging: boolean) => void;
}) {
  size = size || "100%";
  const pieceRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasDragged, setHasDragged] = useState(false);
  /** Pointer position and size of the piece being dragged, if any. */
  const [drag, setDrag] = useState<{ x: number; y: number; size: number } | null>(null);

  const handleClick = () => {
    onSelect?.(piece, hasDragged);
    setHasDragged(false);
  };

  if (!boardRef || !putPiece) {
    return (
      <div
        ref={pieceRef}
        className={getPieceName(piece)}
        style={{
          width: size,
          height: size,
          backgroundSize: "cover",
        }}
      />
    );
  }

  const handleDrop = (position: { x: number; y: number }) => {
    const boardRect = boardRef?.current?.getBoundingClientRect();
    if (
      boardRect &&
      position.x > boardRect.left &&
      position.x < boardRect.right &&
      position.y > boardRect.top &&
      position.y < boardRect.bottom
    ) {
      const boardWidth = boardRect.width;
      const boardHeight = boardRect.height;
      const squareWidth = boardWidth / 8;
      const squareHeight = boardHeight / 8;
      let x = Math.floor((position.x - boardRect.left) / squareWidth);
      let y = Math.floor((position.y - boardRect.top) / squareHeight);

      if (orientation === "black") {
        x = 7 - x;
        y = 7 - y;
      }
      putPiece(squareFromCoords(x, 7 - y)!, piece);
    }
  };

  /** Size the dragged ghost like a board square, falling back to the palette cell. */
  const ghostSize = () => {
    const boardWidth = boardRef?.current?.getBoundingClientRect().width;
    if (boardWidth) return boardWidth / 8;
    const rect = pieceRef.current?.getBoundingClientRect();
    return rect ? Math.min(rect.width, rect.height) : 40;
  };

  return (
    <>
      <Draggable
        nodeRef={pieceRef}
        // Pinned: the node itself never moves, because a transform here would
        // be clipped by any scrolling ancestor. The ghost below does the
        // moving instead, portalled out of the way.
        position={{ x: 0, y: 0 }}
        // Deliberately no onStart: it fires on mousedown, and hiding the piece
        // there would swallow the mouseup, so a plain click could never select.
        onDrag={(e) => {
          setIsDragging(true);
          setHasDragged(true);
          setDrag({ ...clientPosition(e), size: ghostSize() });
        }}
        onStop={(e) => {
          handleDrop(clientPosition(e));
          setIsDragging(false);
          setDrag(null);
        }}
        scale={1}
      >
        <div
          ref={pieceRef}
          className={getPieceName(piece)}
          style={{
            backgroundSize: "contain",
            backgroundRepeat: "no-repeat",
            backgroundPosition: "center",
            zIndex: 100,
            // Hidden outright while dragging: react-draggable still translates
            // this node, which would trail the ghost by the grab offset.
            visibility: drag ? "hidden" : "visible",
            backgroundColor:
              !isDragging &&
              selectedPiece &&
              piece.role === selectedPiece.role &&
              piece.color === selectedPiece.color
                ? "var(--mantine-primary-color-filled)"
                : "transparent",
          }}
          onClick={handleClick}
        />
      </Draggable>
      {drag &&
        createPortal(
          <div
            className={getPieceName(piece)}
            style={{
              position: "fixed",
              left: drag.x,
              top: drag.y,
              width: drag.size,
              height: drag.size,
              // Centred on the pointer, so the piece lands where you point
              // whatever part of the palette cell you grabbed.
              transform: "translate(-50%, -50%)",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
              pointerEvents: "none",
              zIndex: 10000,
            }}
          />,
          document.body,
        )}
    </>
  );
}

const getPieceName = (piece: Piece) => `${piece.color} ${piece.role}`;
