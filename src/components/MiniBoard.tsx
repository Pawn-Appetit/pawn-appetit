import { Box } from "@mantine/core";
import { parseSquare } from "chessops";
import { parseFen } from "chessops/fen";
import { squareFile, squareRank } from "chessops/util";
import { memo } from "react";

/**
 * A static board, drawn small enough to scan dozens at a time.
 *
 * Pieces reuse the global `"pawn white"` classes that the piece-set stylesheets
 * define, so a miniature always matches the set chosen in settings without
 * knowing which one that is. Nothing here is interactive — no chessground
 * instance, just one positioned element per occupied square.
 */
/** Centre of `square` in board percentages, y measured from the top. */
function centre(square: number) {
  return {
    x: squareFile(square) * 12.5 + 6.25,
    y: (7 - squareRank(square)) * 12.5 + 6.25,
  };
}

function MiniBoard({ fen, move }: { fen: string; move?: string | null }) {
  const [setup] = parseFen(fen).unwrap(
    (value) => [value, null],
    (error) => [null, error],
  );
  if (!setup) return null;

  // A UCI move ("e2e4", or "e7e8q" when promoting); the trailing piece is
  // irrelevant to where the arrow points.
  const from = move ? parseSquare(move.slice(0, 2)) : undefined;
  const to = move ? parseSquare(move.slice(2, 4)) : undefined;
  const arrow =
    from !== undefined && to !== undefined ? { from: centre(from), to: centre(to) } : null;

  return (
    <Box
      style={{
        // Fills whatever cell it is given and stays square, so the grid can
        // size itself to the panel rather than to the viewport.
        width: "100%",
        aspectRatio: "1",
        position: "relative",
        // Two-tone checkerboard without 64 elements: each gradient paints the
        // dark squares of one colour's diagonal.
        // A conic gradient tiles two squares by two with crisp edges; the
        // 45-degree linear trick leaves visible diagonal seams at this size.
        backgroundImage:
          "conic-gradient(var(--mini-board-dark, #8ba0b0) 25%, var(--mini-board-light, #e9edf0) 0 50%, var(--mini-board-dark, #8ba0b0) 0 75%, var(--mini-board-light, #e9edf0) 0)",
        backgroundSize: "25% 25%",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      {[...setup.board.occupied].map((square) => {
        const piece = setup.board.get(square);
        if (!piece) return null;
        return (
          <div
            key={square}
            className={`${piece.role} ${piece.color}`}
            style={{
              position: "absolute",
              left: `${squareFile(square) * 12.5}%`,
              // rank 0 is the bottom of the board, the top of the element
              top: `${(7 - squareRank(square)) * 12.5}%`,
              width: "12.5%",
              height: "12.5%",
              backgroundSize: "contain",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "center",
            }}
          />
        );
      })}
      {arrow && <Arrow from={arrow.from} to={arrow.to} />}
    </Box>
  );
}

type Point = { x: number; y: number };

/**
 * The move played from the matched position, drawn over the board.
 *
 * The head is a plain polygon rather than an SVG `marker`, so that nothing
 * has to be registered under a document-unique id — a grid holds dozens of
 * these at once.
 */
function Arrow({ from, to }: { from: Point; to: Point }) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) return null;

  const ux = dx / length;
  const uy = dy / length;
  // Stop short of the square's centre so the head sits on the target piece
  // rather than covering it.
  const HEAD = 5.5;
  const HALF_WIDTH = 3.5;
  const tipX = to.x - ux * 2;
  const tipY = to.y - uy * 2;
  const baseX = tipX - ux * HEAD;
  const baseY = tipY - uy * HEAD;

  return (
    <svg
      viewBox="0 0 100 100"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}
      // Decorative: the move is already named in the game it links to.
      aria-hidden
    >
      <title>move played</title>
      <g stroke="var(--mini-board-arrow, #f28c28)" fill="var(--mini-board-arrow, #f28c28)">
        <line
          x1={from.x + ux * 3}
          y1={from.y + uy * 3}
          x2={baseX}
          y2={baseY}
          strokeWidth={3}
          strokeLinecap="round"
          opacity={0.9}
        />
        <polygon
          points={`${tipX},${tipY} ${baseX - uy * HALF_WIDTH},${baseY + ux * HALF_WIDTH} ${
            baseX + uy * HALF_WIDTH
          },${baseY - ux * HALF_WIDTH}`}
          opacity={0.9}
        />
      </g>
    </svg>
  );
}

export default memo(MiniBoard);
