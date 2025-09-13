import { ActionIcon, Group, Menu } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import {
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconDotsVertical,
  IconChess,
  IconChessFilled,
  IconCamera,
  IconArrowBack,
  IconTarget,
  IconZoomCheck,
  IconEraser,
  IconEdit,
  IconEditOff,
  IconDeviceFloppy,
  IconReload,
  IconPlus,
  IconSwitchVertical,
} from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { memo, useContext, useMemo } from "react";
import { useStore } from "zustand";
import { useTranslation } from "react-i18next";
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
  dirty,
  autoSave,
  reload,
  addGame,
  toggleOrientation,
  currentTabSourceType,
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
              {t("Board.Action.TogglePawnStructureView")}
            </Menu.Item>
          )}
          {takeSnapshot && (
            <Menu.Item leftSection={<IconCamera size="1.3rem" />} onClick={() => takeSnapshot()}>
              {t("Board.Action.TakeSnapshot")}
            </Menu.Item>
          )}
          {canTakeBack && deleteMoveProp && (
            <Menu.Item leftSection={<IconArrowBack size="1.3rem" />} onClick={() => deleteMoveProp()}>
              {t("Board.Action.TakeBack")}
            </Menu.Item>
          )}
          {changeTabType && (
            <Menu.Item
              leftSection={
                currentTabType === "analysis" ? <IconTarget size="1.3rem" /> : <IconZoomCheck size="1.3rem" />
              }
              onClick={changeTabType}
            >
              {t(currentTabType === "analysis" ? "Board.Action.PlayFromHere" : "Board.Action.AnalyzeGame")}
            </Menu.Item>
          )}
          {!eraseDrawablesOnClick && clearShapes && (
            <Menu.Item leftSection={<IconEraser size="1.3rem" />} onClick={() => clearShapes()}>
              {t("Board.Action.ClearDrawings")}
            </Menu.Item>
          )}
          {!disableVariations && toggleEditingMode && (
            <Menu.Item
              leftSection={editingMode ? <IconEditOff size="1.3rem" /> : <IconEdit size="1.3rem" />}
              onClick={() => toggleEditingMode()}
            >
              {t("Board.Action.EditPosition")}
            </Menu.Item>
          )}
          {saveFile && (
            <Menu.Item leftSection={<IconDeviceFloppy size="1.3rem" />} onClick={() => saveFile()}>
              {t("Board.Action.SavePGN", { key: keyMap.SAVE_FILE.keys })}
            </Menu.Item>
          )}
          {reload && (
            <Menu.Item leftSection={<IconReload size="1.3rem" />} onClick={() => reload()}>
              {t("Menu.View.Reload")}
            </Menu.Item>
          )}
          {addGame && currentTabSourceType === "file" && (
            <Menu.Item leftSection={<IconPlus size="1.3rem" />} onClick={() => addGame()}>
              {t("Board.Action.AddGame")}
            </Menu.Item>
          )}
          {toggleOrientation && (
            <Menu.Item leftSection={<IconSwitchVertical size="1.3rem" />} onClick={() => toggleOrientation()}>
              {t("Board.Action.FlipBoard", { key: keyMap.SWAP_ORIENTATION.keys })}
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
      <ActionIcon variant="default" size="lg" onClick={start}>
        <IconChevronsLeft />
      </ActionIcon>
      <ActionIcon variant="default" size="lg" onClick={previous}>
        <IconChevronLeft />
      </ActionIcon>
      <ActionIcon variant="default" size="lg" onClick={next}>
        <IconChevronRight />
      </ActionIcon>
      <ActionIcon variant="default" size="lg" onClick={end}>
        <IconChevronsRight />
      </ActionIcon>
      {!readOnly && boardControlsMenu}
    </Group>
  );
}

export default memo(MoveControls);
