import { SimpleGrid } from "@mantine/core";
import type { Piece as PieceType } from "chessground/types";
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
}: {
  fen: string;
  boardRef: React.MutableRefObject<HTMLDivElement | null>;
  onPut: (newFen: string) => void;
  vertical?: boolean;
  orientation?: "white" | "black";
  selectedPiece?: PieceType | null;
  setSelectedPiece?: (piece: PieceType | null) => void;
}) {
  const handlePieceSelect = (piece: PieceType, isDragging: boolean) => {
    if (!isDragging && selectedPiece && piece.role === selectedPiece.role && piece.color === selectedPiece.color) {
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
    </SimpleGrid>
  );
}

export default PiecesGrid;
