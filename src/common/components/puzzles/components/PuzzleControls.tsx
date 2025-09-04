import { ActionIcon, Button, Group, Input, Select, Text, Tooltip } from "@mantine/core";
import { IconPlus, IconX, IconZoomCheck } from "@tabler/icons-react";
import { Chess, parseUci } from "chessops";
import { parseFen } from "chessops/fen";
import { useAtom, useSetAtom } from "jotai";
import { useContext, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { TreeStateContext } from "@/common/components/TreeStateContext";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import type { Completion, Puzzle } from "@/utils/puzzles";
import { createTab } from "@/utils/tabs";
import { defaultTree } from "@/utils/treeReducer";

interface PuzzleControlsProps {
  selectedDb: string | null;
  onGeneratePuzzle: () => void;
  onClearSession: () => void;
  changeCompletion: (completion: Completion) => void;
  currentPuzzle?: Puzzle;
  puzzles: Puzzle[];
  jumpToNext: "off" | "success" | "success-and-failure";
  onJumpToNextChange: (value: "off" | "success" | "success-and-failure") => void;
  turnToMove: "white" | "black" | null;
}

export const PuzzleControls = ({
  selectedDb,
  onGeneratePuzzle,
  onClearSession,
  changeCompletion,
  currentPuzzle,
  puzzles,
  jumpToNext,
  onJumpToNextChange,
  turnToMove,
}: PuzzleControlsProps) => {
  const { t } = useTranslation();
  const jumpToNextId = useId();
  const store = useContext(TreeStateContext)!;
  const goToStart = useStore(store, (s) => s.goToStart);
  const makeMove = useStore(store, (s) => s.makeMove);
  const reset = useStore(store, (s) => s.reset);

  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  const [showingSolution, setShowingSolution] = useState(false);

  const handleAnalyzePosition = () => {
    if (!currentPuzzle) return;

    createTab({
      tab: {
        name: "Puzzle Analysis",
        type: "analysis",
      },
      setTabs,
      setActiveTab,
      pgn: currentPuzzle.moves.join(" "),
      headers: {
        ...defaultTree().headers,
        fen: currentPuzzle.fen,
        orientation:
          Chess.fromSetup(parseFen(currentPuzzle.fen).unwrap()).unwrap().turn === "white" ? "black" : "white",
      },
    });
  };

  const handleViewSolution = async () => {
    if (!currentPuzzle) return;
    changeCompletion("incorrect");

    setShowingSolution(true);
    goToStart();

    for (let i = 0; i < currentPuzzle.moves.length; i++) {
      makeMove({
        payload: parseUci(currentPuzzle.moves[i])!,
        mainline: true,
      });
      await new Promise((r) => setTimeout(r, 500));
    }

    setShowingSolution(false);
  };

  const handleClearSession = () => {
    onClearSession();
    reset();
  };

  return (
    <>
      <Group justify="space-between">
        <Group>
          <Group align="center">
            <Input.Label htmlFor={jumpToNextId}>{t("features.puzzle.jumpToNext")}:</Input.Label>
            <Select
              id={jumpToNextId}
              data={[
                { value: "off", label: t("features.puzzle.jumpToNextOff") },
                { value: "success", label: t("features.puzzle.jumpToNextOnSuccess") },
                { value: "success-and-failure", label: t("features.puzzle.jumpToNextOnSuccessAndFailure") },
              ]}
              value={jumpToNext}
              onChange={(value) => onJumpToNextChange(value as "off" | "success" | "success-and-failure")}
              size="xs"
            />
          </Group>

          <Tooltip label={t("features.puzzle.newPuzzle")}>
            <ActionIcon disabled={!selectedDb} onClick={onGeneratePuzzle}>
              <IconPlus />
            </ActionIcon>
          </Tooltip>

          <Tooltip label={t("features.puzzle.analyzePosition")}>
            <ActionIcon disabled={!selectedDb} onClick={handleAnalyzePosition}>
              <IconZoomCheck />
            </ActionIcon>
          </Tooltip>

          <Tooltip label={t("features.puzzle.clearSession")}>
            <ActionIcon onClick={handleClearSession}>
              <IconX />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Group>
      <Group justify="space-between" mt="sm">
        <Button
          variant="light"
          onClick={handleViewSolution}
          disabled={puzzles.length === 0 || showingSolution || turnToMove === null}
        >
          {showingSolution ? t("features.puzzle.showingSolution") : t("features.puzzle.viewSolution")}
        </Button>
        {turnToMove && <Text fz="1.50rem">{turnToMove === "white" ? t("chess.fen.blackToMove") : t("chess.fen.whiteToMove")}</Text>}
      </Group>
    </>
  );
};
