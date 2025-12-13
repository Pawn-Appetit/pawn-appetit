import { Box, Flex, Select, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { useEffect, useMemo, memo, startTransition, useRef, useState } from "react";
import PieceComponent from "@/components/Piece";
import { pieceSetAtom } from "@/state/atoms";
import { ensurePieceSetCss } from "@/utils/pieceSetCss";
import { applyPieceSetPreviewCss, clearPieceSetPreviewCss } from "@/utils/pieceSetPreviewCss";

type Item = {
  label: string;
  value: string;
};

const pieceSets: Item[] = [
  { label: "Alpha", value: "alpha" },
  { label: "Anarcandy", value: "anarcandy" },
  { label: "California", value: "california" },
  { label: "Cardinal", value: "cardinal" },
  { label: "Cburnett", value: "cburnett" },
  { label: "Chess7", value: "chess7" },
  { label: "Chessnut", value: "chessnut" },
  { label: "Companion", value: "companion" },
  { label: "Disguised", value: "disguised" },
  { label: "Dubrovny", value: "dubrovny" },
  { label: "Fantasy", value: "fantasy" },
  { label: "Fresca", value: "fresca" },
  { label: "Gioco", value: "gioco" },
  { label: "Governor", value: "governor" },
  { label: "Horsey", value: "horsey" },
  { label: "ICpieces", value: "icpieces" },
  { label: "Kosal", value: "kosal" },
  { label: "Leipzig", value: "leipzig" },
  { label: "Letter", value: "letter" },
  { label: "Libra", value: "libra" },
  { label: "Maestro", value: "maestro" },
  { label: "Merida", value: "merida" },
  { label: "Pirouetti", value: "pirouetti" },
  { label: "Pixel", value: "pixel" },
  { label: "Reillycraig", value: "reillycraig" },
  { label: "Riohacha", value: "riohacha" },
  { label: "Shapes", value: "shapes" },
  { label: "Spatial", value: "spatial" },
  { label: "Staunty", value: "staunty" },
  { label: "Tatiana", value: "tatiana" },
];

// Memoizar DisplayPieces para evitar re-renders innecesarios
const DisplayPieces = memo(function DisplayPieces({ pieceSet }: { pieceSet: string }) {
  const pieces = ["rook", "knight", "bishop", "queen", "king", "pawn"] as const;

  return (
    <Box id="piece-preview-container">
      <Flex gap="xs">
        {pieces.map((role, index) => (
          <Box key={index} h="2.5rem" w="2.5rem">
            <PieceComponent piece={{ color: "white", role }} />
          </Box>
        ))}
      </Flex>
    </Box>
  );
});

export default function PiecesSelect() {
  const { t } = useTranslation();
  const [pieceSet, setPieceSet] = useAtom(pieceSetAtom);
  const [previewPieceSet, setPreviewPieceSet] = useState<string | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  const selectedLabel = useMemo(
    () => pieceSets.find((p) => p.value === pieceSet)?.label || pieceSet,
    [pieceSet],
  );

  const handleOptionClick = (value: string) => {
    // Warm cache in the background; the App-level manager will swap atomically.
    ensurePieceSetCss(value, { preloadOnly: true }).catch(() => {});
    startTransition(() => setPieceSet(value));
  };

  // Apply/clear preview-only CSS when hovering options
  useEffect(() => {
    const controller = new AbortController();

    if (!previewPieceSet) {
      clearPieceSetPreviewCss();
      return () => controller.abort();
    }

    // Debounced hover loads are handled by the hover handler; here we just apply.
    applyPieceSetPreviewCss(previewPieceSet, { signal: controller.signal }).catch(() => {
      // Ignore preview failures
    });

    return () => controller.abort();
  }, [previewPieceSet]);

  const data = useMemo(() => pieceSets.map((p) => ({ value: p.value, label: p.label })), []);

  return (
    <div>
      <Flex justify="space-between" align="center" gap="md">
        <DisplayPieces pieceSet={pieceSet} />
        <Select
          w="10rem"
          data={data}
          value={pieceSet}
          searchable
          clearable={false}
          allowDeselect={false}
          placeholder={selectedLabel}
          onChange={(value) => {
            if (!value) return;
            handleOptionClick(value);
          }}
          onDropdownClose={() => {
            if (hoverTimeoutRef.current) {
              window.clearTimeout(hoverTimeoutRef.current);
              hoverTimeoutRef.current = null;
            }
            setPreviewPieceSet(null);
          }}
          renderOption={({ option }) => {
            return (
              <div
                onMouseEnter={() => {
                  if (hoverTimeoutRef.current) {
                    window.clearTimeout(hoverTimeoutRef.current);
                  }
                  // Small debounce to avoid thrashing when moving mouse fast.
                  hoverTimeoutRef.current = window.setTimeout(() => {
                    setPreviewPieceSet(option.value);
                  }, 80);
                }}
                onMouseLeave={() => {
                  if (hoverTimeoutRef.current) {
                    window.clearTimeout(hoverTimeoutRef.current);
                    hoverTimeoutRef.current = null;
                  }
                  setPreviewPieceSet(null);
                }}
              >
                <Text fz="sm" fw={500}>
                  {option.label}
                </Text>
              </div>
            );
          }}
        />
      </Flex>
    </div>
  );
}
