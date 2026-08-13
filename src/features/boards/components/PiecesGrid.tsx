import type { Piece as PieceType } from "@lichess-org/chessground/types";
import { Box, SimpleGrid, Tooltip, UnstyledButton } from "@mantine/core";
import { COLORS, ROLES } from "chessops";
import { makeFen, parseFen } from "chessops/fen";
import Piece from "@/components/Piece";

function PiecesGrid({
  fen,
  boardRef,
  vertical,
  onPut,
  orientation = "white",
  selectedPiece,
  setSelectedPiece,
  emptyMarker,
}: {
  fen: string;
  boardRef: React.MutableRefObject<HTMLDivElement | null>;
  onPut: (newFen: string) => void;
  vertical?: boolean;
  orientation?: "white" | "black";
  selectedPiece?: PieceType | null;
  setSelectedPiece?: (piece: PieceType | null) => void;
  /**
   * Adds a "must be empty" marker alongside the pieces, selected like one.
   *
   * Only meaningful for partial position search, where a square can be
   * required to hold nothing; omit it everywhere else.
   */
  emptyMarker?: {
    selected: boolean;
    label: string;
    onSelect: () => void;
  };
}) {
  const handlePieceSelect = (piece: PieceType, isDragging: boolean) => {
    if (
      !isDragging &&
      selectedPiece &&
      piece.role === selectedPiece.role &&
      piece.color === selectedPiece.color
    ) {
      setSelectedPiece?.(null);
    } else {
      setSelectedPiece?.(piece);
    }
  };

  return (
    <SimpleGrid cols={vertical ? 2 : 6} flex={1} w="100%">
      {COLORS.map((color) =>
        ROLES.map((role) => (
          <Piece
            key={role + color}
            putPiece={(to, piece) => {
              const setup = parseFen(fen).unwrap();
              setup.board.set(to, piece);
              onPut(makeFen(setup));
            }}
            // @ts-expect-error
            boardRef={boardRef}
            piece={{
              role,
              color,
            }}
            orientation={orientation}
            onSelect={handlePieceSelect}
            selectedPiece={selectedPiece}
          />
        )),
      )}
      {emptyMarker && (
        <Tooltip label={emptyMarker.label} withArrow>
          <UnstyledButton
            onClick={emptyMarker.onSelect}
            aria-label={emptyMarker.label}
            aria-pressed={emptyMarker.selected}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              borderRadius: "var(--mantine-radius-sm)",
              background: emptyMarker.selected ? "var(--mantine-color-red-light)" : "transparent",
            }}
          >
            {/* Matches the red ring drawn on forbidden squares. */}
            <Box
              style={{
                width: "min(60%, 2.5rem)",
                aspectRatio: "1",
                borderRadius: "50%",
                border: "2px solid var(--mantine-color-red-6)",
              }}
            />
          </UnstyledButton>
        </Tooltip>
      )}
    </SimpleGrid>
  );
}

export default PiecesGrid;
