import { ActionIcon, Group, Menu } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import {
  IconArrowBack,
  IconCamera,
  IconChess,
  IconChessFilled,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconDeviceFloppy,
  IconDotsVertical,
  IconEdit,
  IconEditOff,
  IconEraser,
  IconPlayerPlay,
  IconPlus,
  IconReload,
  IconSwitchVertical,
  IconTarget,
  IconZoomCheck,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { memo, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { keyMapAtom } from "@/state/keybindings";
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
  const { t } = useTranslation();
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

  const boardControlsMenu = useMemo(
    () => (
      <Menu closeOnItemClick={false}>
        <Menu.Target>
          <ActionIcon variant="default" size="lg">
            <IconDotsVertical size="1rem" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          {setViewPawnStructure && (
            <Menu.Item
              leftSection={viewPawnStructure ? <IconChessFilled size="1.3rem" /> : <IconChess size="1.3rem" />}
              onClick={() => setViewPawnStructure(!viewPawnStructure)}
            >
              {t("features.board.actions.togglePawnStructureView")}
            </Menu.Item>
          )}
          {takeSnapshot && (
            <Menu.Item leftSection={<IconCamera size="1.3rem" />} onClick={() => takeSnapshot()}>
              {t("features.board.actions.takeSnapshot")}
            </Menu.Item>
          )}
          {canTakeBack && deleteMoveProp && (
            <Menu.Item leftSection={<IconArrowBack size="1.3rem" />} onClick={() => deleteMoveProp()}>
              {t("features.board.actions.takeBack")}
            </Menu.Item>
          )}
          {changeTabType && (
            <Menu.Item
              leftSection={
                currentTabType === "analysis" ? <IconTarget size="1.3rem" /> : <IconZoomCheck size="1.3rem" />
              }
              onClick={changeTabType}
            >
              {t(
                currentTabType === "analysis"
                  ? "features.board.actions.playFromHere"
                  : "features.board.actions.analyzeGame",
              )}
            </Menu.Item>
          )}
          {!eraseDrawablesOnClick && clearShapes && (
            <Menu.Item leftSection={<IconEraser size="1.3rem" />} onClick={() => clearShapes()}>
              {t("features.board.actions.clearDrawings")}
            </Menu.Item>
          )}
          {!disableVariations && toggleEditingMode && (
            <Menu.Item
              leftSection={editingMode ? <IconEditOff size="1.3rem" /> : <IconEdit size="1.3rem" />}
              onClick={() => toggleEditingMode()}
            >
              {t("features.board.actions.editPosition")}
            </Menu.Item>
          )}
          {saveFile && (
            <Menu.Item leftSection={<IconDeviceFloppy size="1.3rem" />} onClick={() => saveFile()}>
              {t("features.board.actions.savePGN", { key: keyMap.SAVE_FILE.keys })}
            </Menu.Item>
          )}
          {reload && (
            <Menu.Item leftSection={<IconReload size="1.3rem" />} onClick={() => reload()}>
              {t("features.menu.reload")}
            </Menu.Item>
          )}
          {addGame && currentTabSourceType === "file" && (
            <Menu.Item leftSection={<IconPlus size="1.3rem" />} onClick={() => addGame()}>
              {t("features.board.actions.addGame")}
            </Menu.Item>
          )}
          {toggleOrientation && (
            <Menu.Item leftSection={<IconSwitchVertical size="1.3rem" />} onClick={() => toggleOrientation()}>
              {t("features.board.actions.flipBoard", { key: keyMap.SWAP_ORIENTATION.keys })}
            </Menu.Item>
          )}
        </Menu.Dropdown>
      </Menu>
    ),
    [
      viewPawnStructure,
      setViewPawnStructure,
      takeSnapshot,
      canTakeBack,
      deleteMoveProp,
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
      keyMap,
      t,
    ],
  );

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
      {currentTabType === "play" && gameState === "settingUp" && startGame && (
        <ActionIcon variant="default" size="lg" onClick={startGame} disabled={startGameDisabled}>
          <IconPlayerPlay />
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
      {!readOnly && boardControlsMenu}
    </Group>
  );
}

export default memo(MoveControls);
