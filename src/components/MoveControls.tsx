import { ActionIcon, Group } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconPlayerPlay,
  IconPlayerStop,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { memo, useContext } from "react";
import { useStore } from "zustand";
import { keyMapAtom } from "@/state/keybindings";
import BoardControlsMenu from "./BoardControlsMenu";
import { TreeStateContext } from "./TreeStateContext";

interface MoveControlsProps {
  readOnly?: boolean;
  // Board controls props
  viewPawnStructure?: boolean;
  setViewPawnStructure?: (value: boolean) => void;
  takeSnapshot?: () => void;
  canTakeBack?: boolean;
  deleteMove?: () => void;
  changeTabType?: () => void;
  currentTabType?: "analysis" | "play";
  eraseDrawablesOnClick?: boolean;
  clearShapes?: () => void;
  disableVariations?: boolean;
  editingMode?: boolean;
  toggleEditingMode?: () => void;
  saveFile?: () => void;
  dirty?: boolean;
  autoSave?: boolean;
  reload?: () => void;
  addGame?: () => void;
  toggleOrientation?: () => void;
  currentTabSourceType?: string;
  // Start Game props for play tabs
  startGame?: () => void;
  endGame?: () => void;
  gameState?: "settingUp" | "playing" | "gameOver";
  startGameDisabled?: boolean;
}

function MoveControls({
  readOnly,
  viewPawnStructure,
  setViewPawnStructure,
  takeSnapshot,
  canTakeBack,
  deleteMove: deleteMoveProp,
  changeTabType,
  currentTabType,
  eraseDrawablesOnClick,
  clearShapes,
  disableVariations,
  editingMode,
  toggleEditingMode,
  saveFile,
  reload,
  addGame,
  toggleOrientation,
  currentTabSourceType,
  // Start Game props
  startGame,
  endGame,
  gameState,
  startGameDisabled,
}: MoveControlsProps) {
  const store = useContext(TreeStateContext)!;
  const next = useStore(store, (s) => s.goToNext);
  const previous = useStore(store, (s) => s.goToPrevious);
  const start = useStore(store, (s) => s.goToStart);
  const end = useStore(store, (s) => s.goToEnd);
  const deleteMove = useStore(store, (s) => s.deleteMove);
  const startBranch = useStore(store, (s) => s.goToBranchStart);
  const endBranch = useStore(store, (s) => s.goToBranchEnd);
  const nextBranch = useStore(store, (s) => s.nextBranch);
  const previousBranch = useStore(store, (s) => s.previousBranch);
  const nextBranching = useStore(store, (s) => s.nextBranching);
  const previousBranching = useStore(store, (s) => s.previousBranching);

  const keyMap = useAtomValue(keyMapAtom);

  useHotkeys([
    [keyMap.PREVIOUS_MOVE.keys, previous],
    [keyMap.NEXT_MOVE.keys, next],
    [keyMap.GO_TO_START.keys, start],
    [keyMap.GO_TO_END.keys, end],
    [keyMap.DELETE_MOVE.keys, readOnly ? () => {} : () => (deleteMoveProp || deleteMove)()],
    [keyMap.GO_TO_BRANCH_START.keys, startBranch],
    [keyMap.GO_TO_BRANCH_END.keys, endBranch],
    [keyMap.NEXT_BRANCH.keys, nextBranch],
    [keyMap.PREVIOUS_BRANCH.keys, previousBranch],
    [keyMap.NEXT_BRANCHING.keys, nextBranching],
    [keyMap.PREVIOUS_BRANCHING.keys, previousBranching],
  ]);

  return (
    <Group grow gap="xs">
      <ActionIcon
        variant="default"
        size="lg"
        onClick={start}
        disabled={currentTabType === "play" && gameState === "settingUp"}
      >
        <IconChevronsLeft />
      </ActionIcon>
      <ActionIcon
        variant="default"
        size="lg"
        onClick={previous}
        disabled={currentTabType === "play" && gameState === "settingUp"}
      >
        <IconChevronLeft />
      </ActionIcon>
      {currentTabType === "play" && (startGame || endGame) && (
        <ActionIcon
          variant="default"
          size="lg"
          onClick={gameState === "playing" ? endGame : startGame}
          disabled={gameState === "playing" ? false : startGameDisabled}
        >
          {gameState === "playing" ? <IconPlayerStop /> : <IconPlayerPlay />}
        </ActionIcon>
      )}
      <ActionIcon
        variant="default"
        size="lg"
        onClick={next}
        disabled={currentTabType === "play" && gameState === "settingUp"}
      >
        <IconChevronRight />
      </ActionIcon>
      <ActionIcon
        variant="default"
        size="lg"
        onClick={end}
        disabled={currentTabType === "play" && gameState === "settingUp"}
      >
        <IconChevronsRight />
      </ActionIcon>
      {!readOnly && (
        <BoardControlsMenu
          viewPawnStructure={viewPawnStructure}
          setViewPawnStructure={setViewPawnStructure}
          takeSnapshot={takeSnapshot}
          canTakeBack={canTakeBack}
          deleteMove={deleteMoveProp}
          changeTabType={changeTabType}
          currentTabType={currentTabType}
          eraseDrawablesOnClick={eraseDrawablesOnClick}
          clearShapes={clearShapes}
          disableVariations={disableVariations}
          editingMode={editingMode}
          toggleEditingMode={toggleEditingMode}
          saveFile={saveFile}
          reload={reload}
          addGame={addGame}
          toggleOrientation={toggleOrientation}
          currentTabSourceType={currentTabSourceType}
        />
      )}
    </Group>
  );
}

export default memo(MoveControls);
